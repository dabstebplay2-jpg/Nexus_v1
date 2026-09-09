const SEARCH_ENGINES = [
  {
    id: 'google',
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q={query}',
    icon: 'G',
  },
  {
    id: 'yandex',
    name: 'Яндекс',
    urlTemplate: 'https://yandex.ru/search/?text={query}',
    icon: 'Я',
  },
  {
    id: 'bing',
    name: 'Bing',
    urlTemplate: 'https://www.bing.com/search?q={query}',
    icon: 'B',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    urlTemplate: 'https://duckduckgo.com/?q={query}',
    icon: 'D',
  },
];

function listSearchEngines() {
  return SEARCH_ENGINES.map(({ id, name, icon }) => ({ id, name, icon }));
}

function getSearchEngine(id) {
  return SEARCH_ENGINES.find((e) => e.id === id) || SEARCH_ENGINES[0];
}

function buildSearchUrl(engineId, query) {
  const engine = getSearchEngine(engineId);
  return engine.urlTemplate.replace('{query}', encodeURIComponent(query.trim()));
}

module.exports = { listSearchEngines, getSearchEngine, buildSearchUrl, SEARCH_ENGINES };
