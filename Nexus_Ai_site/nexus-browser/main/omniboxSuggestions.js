const { getHistory, getBookmarks, getSettings } = require('./storage');
const { getSearchEngine, buildSearchUrl } = require('./searchEngines');
const { looksLikeUrl } = require('./navUtils');

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function scoreMatch(item, q, recencyIndex, typeBoost) {
  const title = (item.title || item.name || '').toLowerCase();
  const url = (item.url || '').toLowerCase();
  const host = hostOf(item.url).toLowerCase();
  const ql = q.toLowerCase();

  let score = -1;
  if (host === ql || title === ql) score = 1000;
  else if (host.startsWith(ql)) score = 800;
  else if (title.startsWith(ql)) score = 700;
  else if (url.startsWith(ql)) score = 600;
  else if (host.includes(ql) || title.includes(ql) || url.includes(ql)) score = 300;
  else return null;

  const visitCount = item.visitCount || 1;
  score += Math.min(visitCount * 15, 150);
  score += Math.max(0, 80 - recencyIndex * 2);
  score += typeBoost;

  return score;
}

function getOmniboxSuggestions(query) {
  const q = (query || '').trim();
  const settings = getSettings();
  const history = getHistory();
  const bookmarks = getBookmarks();
  const shortcuts = settings.ntpShortcuts || [];
  const engine = getSearchEngine(settings.searchEngine);

  const results = [];
  const seenUrls = new Set();

  function push(item) {
    if (item.url && seenUrls.has(item.url)) return;
    if (item.url) seenUrls.add(item.url);
    results.push(item);
  }

  if (!q) {
    history.slice(0, 14).forEach((h, i) => {
      push({
        type: 'history',
        url: h.url,
        title: h.title || hostOf(h.url) || h.url,
        subtitle: hostOf(h.url),
        score: 1000 - i + (h.visitCount || 1) * 12,
      });
    });
    bookmarks.slice(0, 8).forEach((b, i) => {
      if (!seenUrls.has(b.url)) {
        push({
          type: 'bookmark',
          url: b.url,
          title: b.title || b.url,
          subtitle: hostOf(b.url),
          score: 500 - i,
        });
      }
    });
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ score, ...rest }) => rest);
  }

  history.forEach((h, i) => {
    const score = scoreMatch(h, q, i, 50);
    if (score != null) {
      push({
        type: 'history',
        url: h.url,
        title: h.title || hostOf(h.url) || h.url,
        subtitle: hostOf(h.url),
        score,
      });
    }
  });

  bookmarks.forEach((b, i) => {
    const score = scoreMatch(b, q, i, 40);
    if (score != null) {
      push({
        type: 'bookmark',
        url: b.url,
        title: b.title || b.url,
        subtitle: hostOf(b.url),
        score,
      });
    }
  });

  shortcuts.forEach((s, i) => {
    const score = scoreMatch({ title: s.name, url: s.url }, q, i, 30);
    if (score != null) {
      push({
        type: 'shortcut',
        url: s.url,
        title: s.name,
        subtitle: hostOf(s.url),
        score,
      });
    }
  });

  if (looksLikeUrl(q)) {
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    push({ type: 'url', url, title: url, subtitle: 'Перейти на сайт', score: 900 });
  }

  push({
    type: 'search',
    query: q,
    url: buildSearchUrl(settings.searchEngine, q),
    title: `Искать в ${engine.name}: «${q}»`,
    subtitle: engine.name,
    score: 100,
  });

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ score, ...rest }) => rest);
}

module.exports = { getOmniboxSuggestions };
