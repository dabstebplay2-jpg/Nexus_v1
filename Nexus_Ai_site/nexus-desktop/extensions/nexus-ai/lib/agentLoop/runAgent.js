const { consumeSseResponse } = require('../sse');
const { buildStreamBody } = require('../chatRequest');
const { parseCodeBlocks } = require('../agentTools');
const { buildAgentContextBlock } = require('../workspaceContext');
const { parseToolCalls, stripToolBlocks } = require('./parseTools');
const { TOOL_DEFINITIONS, executeTool } = require('./tools');

const MAX_ITERATIONS = 10;

/**
 * @param {string} text
 */
function isCasualMessage(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 140) return false;
  if (/^(привет|здравствуй|здравствуйте|hi|hello|hey|добрый\s+(день|вечер|утро)|спасибо|thanks|thank\s+you)[\s!.?,]*$/i.test(t)) {
    return true;
  }
  return t.length < 20 && !/\b(файл|file|создай|удали|write|read|код|code|папк|folder|html|js|ts)\b/i.test(t);
}

/**
 * @param {{ tool: string, args: Record<string, unknown>, status: string }[]} runs
 */
function summarizeToolRuns(runs) {
  if (!runs.length) return '';
  const lines = runs.map((r) => {
    const mark = r.status === 'error' ? '✗' : '✓';
    const args = r.args || {};
    let detail = '';
    if (r.tool === 'write_file' && args.path) detail = ` → \`${args.path}\``;
    else if (r.tool === 'read_file' && args.path) detail = ` → \`${args.path}\``;
    else if (r.tool === 'list_dir') detail = ` → \`${args.path || '.'}\``;
    else if (r.tool === 'delete_path' && args.path) detail = ` → \`${args.path}\``;
    else if (r.tool === 'search_workspace' && args.query) detail = ` «${String(args.query).slice(0, 80)}»`;
    return `${mark} **${r.tool}**${detail}`;
  });
  return `### Готово\n\n${lines.join('\n\n')}\n\nИзменения применены в workspace.`;
}

/**
 * @param {object} opts
 */
async function runAgentChat(opts) {
  const { post, auth, msg, provider } = opts;
  const {
    resolvedModel,
    enableThinking,
    useWebSearch,
    webSearchDepth,
    conversationSources,
    userContent,
    apiAttachments,
    modelMeta,
    assistantId,
  } = opts.prepared;

  const abortSignal = provider.abortController?.signal;
  const agentCtx = await buildAgentContextBlock();
  const allowTools = !isCasualMessage(userContent);

  const baseParts = [
    'Ты агент Nexus IDE. Отвечай на русском, если пользователь пишет по-русски.',
    'Не повторяй chain-of-thought в финальном ответе. Не выдумывай содержимое файлов — читай через read_file.',
    agentCtx,
  ];

  if (allowTools) {
    baseParts.splice(
      1,
      0,
      'Используй инструменты только когда нужно прочитать/изменить файлы, выполнить команду или посмотреть структуру проекта. На приветствия отвечай текстом без инструментов.',
      'Сначала вызывай инструменты (блок nexus-tool), затем дай короткий финальный ответ о том, что сделано.',
      TOOL_DEFINITIONS
    );
  } else {
    baseParts.splice(
      1,
      0,
      'Это простой разговорный запрос — ответь дружелюбно текстом, без вызова инструментов и без блоков nexus-tool.'
    );
  }

  const messages = [
    { role: 'system', content: baseParts.join('\n\n') },
    ...provider.chatHistory.slice(-16),
    { role: 'user', content: userContent },
  ];

  post({
    type: 'streamStart',
    assistantId,
    modelLabel: modelMeta?.display_name || resolvedModel,
    agentMode: true,
  });

  let streamEnded = false;
  const endAgentStream = () => {
    if (streamEnded) return;
    streamEnded = true;
    const answerText = finalAnswer || streamedAnswer;
    post({
      type: 'streamEnd',
      hasBlocks: parseCodeBlocks(answerText).length > 0,
      sources: [],
    });
  };

  let finalAnswer = '';
  let thinkingStream = '';
  let preSearchThinking = '';
  /** @type {{ tool: string, args: Record<string, unknown>, status: string }[]} */
  const toolRuns = [];
  let streamedAnswer = '';

  const setVisibleAnswer = (text) => {
    streamedAnswer = text || '';
    post({ type: 'streamSetText', text: streamedAnswer });
  };

  const streamVisibleTokens = (turnText, lastVisibleRef) => {
    const visible = stripToolBlocks(turnText);
    if (visible.length > lastVisibleRef.value) {
      post({ type: 'token', content: visible.slice(lastVisibleRef.value) });
      lastVisibleRef.value = visible.length;
    }
    return visible;
  };

  try {
  for (let iter = 0; iter < MAX_ITERATIONS; iter += 1) {
    if (abortSignal?.aborted) break;

    const body = buildStreamBody({
      model: resolvedModel,
      messages,
      attachments: apiAttachments,
      useWebSearch: iter === 0 ? useWebSearch : false,
      webSearchDepth,
      enableThinking,
      agentId: msg.agentId || undefined,
      conversationSources: iter === 0 ? conversationSources : undefined,
    });

    post({ type: 'streamStatus', text: `Агент · шаг ${iter + 1}…` });

    let turnText = '';
    const lastVisible = { value: 0 };
    let streamPhase = useWebSearch && iter === 0 ? 'pre' : 'answer';

    const res = await auth.cloudFetch('/ai/chat/simple/stream', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: abortSignal,
    });

    await consumeSseResponse(res, {
      onThinking: (chunk) => {
        if (streamPhase === 'pre') preSearchThinking += chunk;
        else thinkingStream += chunk;
        post({
          type: streamPhase === 'pre' ? 'preSearchThinking' : 'thinking',
          content: chunk,
        });
      },
      onToken: (token) => {
        turnText += token;
        if (allowTools) streamVisibleTokens(turnText, lastVisible);
        else {
          post({ type: 'token', content: token });
        }
      },
      onStatus: (status) => {
        if (status === 'search_ready' || status === 'searching') streamPhase = 'answer';
      },
      onError: (detail) => post({ type: 'error', text: detail }),
    });

    const toolCalls = allowTools ? parseToolCalls(turnText) : [];
    if (!toolCalls.length) {
      finalAnswer = allowTools ? stripToolBlocks(turnText) : turnText;
      streamedAnswer = finalAnswer;
      break;
    }

    const visibleBeforeTools = stripToolBlocks(turnText);
    setVisibleAnswer(visibleBeforeTools);
    lastVisible.value = visibleBeforeTools.length;

    messages.push({ role: 'assistant', content: turnText });

    for (const call of toolCalls) {
      if (abortSignal?.aborted) break;
      const stepId = `tool-${Date.now()}-${call.tool}`;
      post({
        type: 'toolStep',
        id: stepId,
        name: call.tool,
        args: call.args,
        status: 'running',
      });
      post({ type: 'streamStatus', text: `Инструмент: ${call.tool}…` });
      let output;
      let status = 'done';
      try {
        output = await executeTool(call.tool, call.args || {});
      } catch (e) {
        output = `Ошибка: ${e.message || String(e)}`;
        status = 'error';
      }
      toolRuns.push({ tool: call.tool, args: call.args || {}, status });
      const preview = String(output).slice(0, 4000);
      post({
        type: 'toolStep',
        id: stepId,
        name: call.tool,
        args: call.args,
        status,
        outputPreview: preview,
      });
      messages.push({
        role: 'user',
        content: `Результат инструмента ${call.tool}:\n\`\`\`\n${preview}\n\`\`\``,
      });
    }

    if (!visibleBeforeTools.trim()) {
      setVisibleAnswer('');
      post({ type: 'streamStatus', text: 'Инструменты выполнены, продолжаю…' });
    }
  }

  if (!finalAnswer.trim() && toolRuns.length) {
    finalAnswer = summarizeToolRuns(toolRuns);
    setVisibleAnswer(finalAnswer);
  }

  if (!finalAnswer.trim() && !abortSignal?.aborted) {
    finalAnswer =
      streamedAnswer.trim() ||
      'Не удалось завершить задачу за отведённое число шагов. Уточните запрос.';
    setVisibleAnswer(finalAnswer);
  }

  } finally {
    endAgentStream();
  }

  return {
    finalAnswer: finalAnswer || streamedAnswer,
    thinkingStream,
    preSearchThinking,
  };
}

module.exports = { runAgentChat, isCasualMessage };
