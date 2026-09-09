const NEXUS_SETTINGS = 'nexus://settings';
const NEXUS_NEWTAB = 'nexus://newtab';
const NEXUS_EXTENSIONS = 'nexus://extensions';

function looksLikeUrl(input) {
  const t = (input || '').trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (t.includes(' ') || !t.includes('.')) return false;
  return /^[a-z0-9.-]+\.[a-z]{2,}/i.test(t);
}

function isInternalUrl(input) {
  const t = (input || '').trim().toLowerCase();
  return t === NEXUS_SETTINGS || t === NEXUS_NEWTAB || t === NEXUS_EXTENSIONS || t.startsWith('nexus://');
}

function resolveNavigationTarget(input) {
  const raw = (input || '').trim();
  if (!raw) return { type: 'empty' };
  if (isInternalUrl(raw)) return { type: 'internal', url: raw };
  if (looksLikeUrl(raw)) {
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return { type: 'url', url };
  }
  return { type: 'search', query: raw };
}

function resolveNewTabUrl(settings) {
  const s = settings || {};
  if (s.newTabPage === 'blank') return 'about:blank';
  if (s.newTabPage === 'custom' && s.newTabCustomUrl) return s.newTabCustomUrl;
  if (s.newTabPage === 'newtab') return NEXUS_NEWTAB;
  return s.homepage || 'https://www.google.com';
}

module.exports = {
  NEXUS_SETTINGS,
  NEXUS_NEWTAB,
  NEXUS_EXTENSIONS,
  looksLikeUrl,
  isInternalUrl,
  resolveNavigationTarget,
  resolveNewTabUrl,
};
