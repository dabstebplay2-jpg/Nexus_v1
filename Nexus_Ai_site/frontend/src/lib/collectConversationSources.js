import { ensureArray } from './normalizeArrays';

const MAX_SOURCES = 80;

/** Собирает уникальные источники из прошлых ответов ассистента в диалоге. */
export function collectConversationSources(messages, { excludeMessageId } = {}) {
  const seen = new Set();
  const out = [];
  for (const m of messages || []) {
    if (m.role !== 'assistant') continue;
    if (excludeMessageId && m.id === excludeMessageId) continue;
    for (const s of ensureArray(m.sources)) {
      const url = (s?.url || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({
        title: s.title || url,
        url,
        snippet: s.snippet || s.title || '',
      });
      if (out.length >= MAX_SOURCES) return out;
    }
  }
  return out;
}
