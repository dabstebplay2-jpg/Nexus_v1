const ENABLED_KEY = 'nexus-web-search';
const DEPTH_KEY = 'nexus-web-search-depth';

/** @typedef {'quick' | 'standard' | 'deep'} WebSearchDepth */

export const WEB_SEARCH_DEPTHS = {
  quick: {
    id: 'quick',
    label: 'Быстрый',
    short: 'Быстро',
    hint: '~8–15 с · до 12 источников · меньше списаний с баланса подписки',
  },
  standard: {
    id: 'standard',
    label: 'Обычный',
    short: 'Норма',
    hint: '~15–25 с · до 25 источников · сбалансированный расход',
  },
  deep: {
    id: 'deep',
    label: 'Глубокий',
    short: 'Глубоко',
    hint: '~35–50 с · до 60 источников · больше времени и списаний',
  },
};

export const DEFAULT_WEB_SEARCH_DEPTH = 'standard';

export function readWebSearchEnabled() {
  try {
    const stored = localStorage.getItem(ENABLED_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

/** @returns {WebSearchDepth} */
export function readWebSearchDepth() {
  try {
    const raw = localStorage.getItem(DEPTH_KEY);
    if (raw && WEB_SEARCH_DEPTHS[raw]) return raw;
    return DEFAULT_WEB_SEARCH_DEPTH;
  } catch {
    return DEFAULT_WEB_SEARCH_DEPTH;
  }
}

export function writeWebSearchEnabled(enabled) {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

/** @param {WebSearchDepth} depth */
export function writeWebSearchDepth(depth) {
  try {
    if (WEB_SEARCH_DEPTHS[depth]) {
      localStorage.setItem(DEPTH_KEY, depth);
    }
  } catch {
    /* ignore */
  }
}

/** Миграция со старого boolean-only ключа */
export function readWebSearchPreference() {
  return readWebSearchEnabled();
}

export function writeWebSearchPreference(enabled) {
  writeWebSearchEnabled(enabled);
}

export function depthMeta(depth) {
  return WEB_SEARCH_DEPTHS[depth] || WEB_SEARCH_DEPTHS[DEFAULT_WEB_SEARCH_DEPTH];
}
