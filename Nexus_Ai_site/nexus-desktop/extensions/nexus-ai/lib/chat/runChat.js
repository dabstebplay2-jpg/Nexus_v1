const vscode = require('vscode');
const { consumeSseResponse } = require('../sse');
const { getEditorContext, formatContextForPrompt } = require('../context');
const { parseCodeBlocks } = require('../agentTools');
const {
  findModelById,
  modelAcceptsPhotos,
  usesReasoningApiForThinking,
} = require('../models');
const { pickResolvedModelId } = require('../thinkingPrefs');
const { attachmentsToApi } = require('../attachmentsApi');
const { buildStreamBody, collectConversationSources } = require('../chatRequest');
const { normalizeDepth } = require('../webSearchPreference');
const { buildAgentContextBlock } = require('../workspaceContext');
const { runAgentChat } = require('../agentLoop/runAgent');

/**
 * @param {import('../../extension').AiChatViewProvider} provider
 * @param {import('vscode').Webview} webview
 * @param {object} auth
 * @param {object} msg
 */
async function executeChat(provider, webview, auth, msg) {
  const post = (m) => provider.postToWebview(m, webview);
  const endStream = (hasBlocks = false, sources = []) => {
    post({ type: 'streamEnd', hasBlocks, sources });
  };

  if (!provider.aiEnabled) {
    post({
      type: 'error',
      text: 'ИИ недоступен на вашем тарифе. Откройте тарифы в панели аккаунта.',
    });
    endStream(false);
    return;
  }

  const modelMeta = findModelById(provider.catalogModels, msg.model);
  const att = msg.attachments || [];
  const hasImages = att.some((a) => a.kind === 'image');
  if (hasImages && modelMeta && !modelAcceptsPhotos(modelMeta)) {
    post({
      type: 'error',
      text: 'Эта модель не принимает фото. Выберите модель с 📷 в списке.',
    });
    endStream(false);
    return;
  }

  if (msg.agentMode && !vscode.workspace.workspaceFolders?.length) {
    post({
      type: 'error',
      text: 'Режим агента требует открытую папку workspace (File → Open Folder).',
    });
    endStream(false);
    return;
  }

  const assistantId = `a-${Date.now()}`;
  const useWebSearch = Boolean(msg.useWebSearch);
  const webSearchDepth = normalizeDepth(msg.webSearchDepth);
  const thinkingOn = Boolean(msg.thinkingEnabled);
  const resolvedModel = modelMeta ? pickResolvedModelId(modelMeta, provider.thinkingPrefs) : msg.model;
  const enableThinking =
    thinkingOn && modelMeta && usesReasoningApiForThinking(modelMeta, provider.thinkingPrefs);
  const conversationSources = collectConversationSources(provider.displayMessages, {
    excludeMessageId: assistantId,
  });

  provider.abortController = new AbortController();
  const ctx = await getEditorContext();
  const ctxText = formatContextForPrompt(ctx);
  let userContent = msg.text || '';
  if (msg.extra) userContent = `${msg.extra}\n\n${userContent}`.trim();
  if (!userContent && att.length) userContent = 'См. вложения.';

  let workspaceBlock = '';
  try {
    workspaceBlock = await buildAgentContextBlock();
  } catch {
    workspaceBlock = '';
  }

  const systemParts = [
    'Ты помощник Nexus IDE. Отвечай на русском, если пользователь пишет по-русски.',
    'Не дублируй внутреннее рассуждение (chain-of-thought) в финальном ответе пользователю.',
    'Для правок кода используй блоки ```язык relative/path.ext с полным содержимым файла.',
    ctxText,
    workspaceBlock,
  ].filter(Boolean);

  const messages = [
    { role: 'system', content: systemParts.join('\n\n') },
    ...provider.chatHistory.slice(-18),
    { role: 'user', content: userContent },
  ];

  const apiAttachments = attachmentsToApi(att);

  try {
    if (msg.agentMode) {
      const result = await runAgentChat({
        post,
        auth,
        msg,
        provider,
        prepared: {
          resolvedModel,
          enableThinking,
          useWebSearch,
          webSearchDepth,
          conversationSources,
          userContent,
          apiAttachments,
          modelMeta,
          assistantId,
        },
      });
      const streamed = result.finalAnswer || '';
      provider.lastBlocks = parseCodeBlocks(streamed);
      provider.chatHistory.push({ role: 'user', content: userContent });
      provider.chatHistory.push({ role: 'assistant', content: streamed });
      provider.displayMessages.push({
        id: `u-${Date.now()}`,
        role: 'user',
        content: userContent,
      });
      provider.displayMessages.push({
        id: assistantId,
        role: 'assistant',
        content: streamed,
        thinking: result.thinkingStream || undefined,
        preSearchThinking: result.preSearchThinking || undefined,
        model: modelMeta?.display_name || resolvedModel,
      });
      vscode.commands.executeCommand('nexus.refreshProfile');
      return;
    }

    const body = buildStreamBody({
      model: resolvedModel,
      messages,
      attachments: apiAttachments,
      useWebSearch,
      webSearchDepth,
      enableThinking,
      agentId: msg.agentId || undefined,
      conversationSources,
    });

    post({
      type: 'streamStart',
      assistantId,
      useWebSearch,
      webSearchDepth,
      modelLabel: modelMeta?.display_name || resolvedModel,
    });

    let streamed = '';
    let thinkingStream = '';
    let preSearchThinking = '';
    let streamPhase = 'answer';
    let searchEngaged = false;
    const searchActivity = useWebSearch
      ? { steps: [], status: null, depth: webSearchDepth }
      : null;

    const postSearch = (patch) => {
      if (searchActivity) post({ type: 'searchActivity', ...patch });
    };

    const postStreamStatus = (text) => {
      if (text) post({ type: 'streamStatus', text });
    };

    let finalSources = [];

    const res = await auth.cloudFetch('/ai/chat/simple/stream', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: provider.abortController.signal,
    });

    await consumeSseResponse(res, {
      onStatus: (status) => {
        if (status === 'search_skipped') {
          searchEngaged = false;
          if (searchActivity) {
            searchActivity.status = null;
            searchActivity.steps = [];
            postSearch({ status: null, steps: [] });
          }
          return;
        }
        if (!useWebSearch && !searchEngaged) return;
        if (status === 'planning') {
          searchEngaged = true;
          streamPhase = 'pre';
          postStreamStatus('Планирую поиск…');
          postSearch({ status: 'Планирую поиск…', steps: searchActivity.steps });
        } else if (status === 'searching') {
          searchEngaged = true;
          streamPhase = 'search';
          postStreamStatus('Ищу в интернете…');
          postSearch({ status: 'Ищу в интернете…', steps: searchActivity.steps });
        } else if (status === 'search_ready') {
          streamPhase = 'answer';
          postStreamStatus('Формирую ответ…');
          postSearch({ status: 'Формирую ответ…', steps: searchActivity.steps });
        } else if (status === 'search_failed') {
          streamPhase = 'answer';
          postStreamStatus('Поиск недоступен, отвечаю без него…');
          postSearch({ status: 'failed', steps: searchActivity.steps });
        }
      },
      onPreSearchDone: () => {
        if (!searchEngaged) return;
        if (preSearchThinking.trim()) {
          searchActivity.steps.unshift({
            id: 'reason-0',
            phase: 'reason',
            intent: preSearchThinking.trim().slice(0, 400),
          });
          postSearch({ steps: searchActivity.steps });
        }
      },
      onSearchPlan: (evt) => {
        if (!searchEngaged || !searchActivity) return;
        searchActivity.steps.push({
          id: `analyze-${searchActivity.steps.length}`,
          phase: 'analyze',
          intent: evt.intent || '',
          queries: evt.queries || [],
        });
        postSearch({ steps: searchActivity.steps, status: 'Анализирую запрос…' });
      },
      onSearchRound: (evt) => {
        if (!searchEngaged || !searchActivity) return;
        const phase = evt.phase || 'search';
        if (phase === 'merge') {
          const prevTotal = searchActivity.steps.length
            ? searchActivity.steps[searchActivity.steps.length - 1].sourcesTotal || 0
            : 0;
          searchActivity.steps.push({
            id: `merge-${evt.round}-${searchActivity.steps.length}`,
            phase: 'merge',
            round: evt.round,
            maxRounds: evt.max_rounds,
            sourcesTotal: evt.sources_total,
            added: Math.max(0, (evt.sources_total || 0) - prevTotal),
          });
        } else {
          searchActivity.steps.push({
            id: `search-${evt.round}-${phase}`,
            phase,
            round: evt.round,
            maxRounds: evt.max_rounds,
            queries: evt.queries || [],
            sourcesTotal: evt.sources_total,
          });
        }
        postSearch({ steps: searchActivity.steps, status: null });
      },
      onThinking: (chunk) => {
        if (streamPhase === 'pre') {
          preSearchThinking += chunk;
          post({ type: 'preSearchThinking', content: chunk, assistantId });
        } else {
          thinkingStream += chunk;
          post({ type: 'thinking', content: chunk, phase: 'answer' });
        }
      },
      onToken: (token) => {
        streamed += token;
        post({ type: 'token', content: token });
      },
      onDone: (data) => {
        finalSources = Array.isArray(data.sources) ? data.sources : [];
        endStream(parseCodeBlocks(streamed).length > 0, finalSources);
      },
      onError: (detail) => post({ type: 'error', text: detail }),
    });

    provider.lastBlocks = parseCodeBlocks(streamed);
    provider.chatHistory.push({ role: 'user', content: userContent });
    provider.chatHistory.push({ role: 'assistant', content: streamed });
    provider.displayMessages.push({
      id: `u-${Date.now()}`,
      role: 'user',
      content: userContent,
    });
    provider.displayMessages.push({
      id: assistantId,
      role: 'assistant',
      content: streamed,
      thinking: thinkingStream || undefined,
      preSearchThinking: preSearchThinking || undefined,
      searchActivity: searchActivity || undefined,
      sources: finalSources.length ? finalSources : undefined,
      model: modelMeta?.display_name || resolvedModel,
    });
    vscode.commands.executeCommand('nexus.refreshProfile');
  } catch (e) {
    if (e.name === 'AbortError') {
      endStream(false);
      return;
    }
    post({ type: 'error', text: e.message || String(e) });
    endStream(false);
  } finally {
    provider.abortController = null;
  }
}

module.exports = { executeChat };
