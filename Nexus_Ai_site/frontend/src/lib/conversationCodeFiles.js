import { languageLabel, parseMessageContent } from './parseMessageContent';

const FULL_REWRITE_RE =
  /\b(с\s*нуля|заново|перепиши\s+полностью|с\s*чистого\s+листа|полностью\s+перепиши|новый\s+файл\s+с\s*нуля|from\s+scratch|rewrite\s+(everything|completely|from\s+scratch)|start\s+over)\b/i;

export function userRequestsFullRewrite(userText = '') {
  return FULL_REWRITE_RE.test(userText);
}

/**
 * @param {Array<{ role?: string, content?: string, codeFiles?: Array }>} messages
 * @param {{ beforeMessageId?: string | null, includeMessageId?: string | null }} [opts]
 */
export function collectConversationCodeFiles(messages, opts = {}) {
  const { beforeMessageId = null, includeMessageId = null } = opts;
  const byName = new Map();

  for (const m of messages || []) {
    if (beforeMessageId && m.id === beforeMessageId) break;

    if (m.role === 'assistant') {
      const files =
        m.codeFiles?.length > 0
          ? m.codeFiles
          : parseMessageContent(m.content || '').codeFiles;
      for (const f of files) {
        const key = f.filename.toLowerCase();
        const prev = byName.get(key);
        if (f.complete === false && prev?.content) {
          byName.set(key, { ...prev, complete: false });
          continue;
        }
        byName.set(key, {
          ...f,
          id: `file:${key}`,
          complete: f.complete !== false,
        });
      }
    }

    if (includeMessageId && m.id === includeMessageId) break;
  }

  return Array.from(byName.values());
}

/** @param {Array} previous @param {Array} incoming */
export function mergeCodeFiles(previous = [], incoming = []) {
  const map = new Map();
  for (const f of previous) {
    map.set(f.filename.toLowerCase(), { ...f });
  }
  for (const f of incoming) {
    const key = f.filename.toLowerCase();
    map.set(key, {
      ...map.get(key),
      ...f,
      id: `file:${key}`,
      complete: f.complete !== false,
    });
  }
  return Array.from(map.values());
}

function truncateForContext(text, maxChars) {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return `${text.slice(0, half)}\n\n… [обрезано для лимита контекста] …\n\n${text.slice(-half)}`;
}

const MAX_FILE_CHARS = 24_000;
const MAX_TOTAL_CHARS = 48_000;

function formatFilesBlock(files) {
  let total = 0;
  const parts = [];
  for (const f of files) {
    let body = f.content || '';
    if (body.length > MAX_FILE_CHARS) {
      body = truncateForContext(body, MAX_FILE_CHARS);
    }
    const block = `### ${f.filename} (${languageLabel(f.language)})\n\`\`\`${f.language} ${f.filename}\n${body}\n\`\`\``;
    if (total + block.length > MAX_TOTAL_CHARS) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join('\n\n');
}

export function buildCodeEditSystemMessage(files, { allowFullRewrite = false } = {}) {
  if (!files?.length) return null;

  const filesBlock = formatFilesBlock(files);
  const rewriteRule = allowFullRewrite
    ? 'Пользователь просит переписать с нуля — можно выдать полностью новые версии файлов.'
    : 'НЕ переписывай файлы с нуля, если пользователь явно не просит («с нуля», «заново», «перепиши полностью»).';

  return [
    'Ты помощник Nexus для написания и правки кода в чате.',
    '',
    'В этой беседе уже есть файлы проекта (актуальные версии):',
    filesBlock,
    '',
    'Правила при правках и доработках:',
    `1. ${rewriteRule}`,
    '2. Меняй только то, что просит пользователь; остальной код, структуру и стиль сохраняй.',
    '3. В ответе выводи ТОЛЬКО файлы, которые реально изменились (не дублируй без изменений неизменённые файлы).',
    '4. Для каждого изменённого файла — полное содержимое файла в блоке ```язык имя_файла ... ```.',
    '5. Кратко объясни изменения обычным текстом вне блоков кода.',
    '6. Имена файлов сохраняй те же (index.html, styles.css и т.д.), если пользователь не просит переименовать.',
  ].join('\n');
}

/**
 * @param {Array<{ role: string, content: string }>} history
 * @param {Array} existingFiles
 * @param {string} userText
 */
export function augmentMessagesWithCodeContext(history, existingFiles, userText) {
  if (!existingFiles.length) return history;

  const systemContent = buildCodeEditSystemMessage(existingFiles, {
    allowFullRewrite: userRequestsFullRewrite(userText),
  });
  if (!systemContent) return history;

  const withoutSystem = history.filter((m) => m.role !== 'system');
  return [{ role: 'system', content: systemContent }, ...withoutSystem];
}

/**
 * После ответа ассистента: объединить файлы проекта и сохранить на сообщении.
 * @param {Array} messages до ответа (без пустого placeholder)
 * @param {string} assistantContent
 * @param {Array} [previousOverride]
 */
export function finalizeAssistantCodeFiles(messages, assistantContent, previousOverride) {
  const previous =
    previousOverride ?? collectConversationCodeFiles(messages.filter((m) => m.role === 'assistant'));
  const { codeFiles: incoming, prose } = parseMessageContent(assistantContent || '');
  const merged = mergeCodeFiles(previous, incoming);
  return { incoming, projectFiles: merged, prose };
}
