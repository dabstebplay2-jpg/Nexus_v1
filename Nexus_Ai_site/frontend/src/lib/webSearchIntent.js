/**
 * Клиентский hint для явного запроса поиска (полная логика — на бэкенде web_search_gate).
 */

const EXPLICIT_RE =
  /(?:найди|найти|поищи|поиск|загугли|гугл(?:и|ь)|search(?:\s+the)?\s+web|google\s+it|look\s+up|в\s+интернете|в\s+сети|online|по\s+интернету|свежие\s+новости|последние\s+новости)/i;

/** Пользователь явно просит искать в сети (бэкенд включит поиск даже при выключенном тоггле). */
export function detectExplicitWebSearchIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return EXPLICIT_RE.test(text.trim());
}
