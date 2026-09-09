const KEY = 'nexus_favorite_models';

export function getFavoriteModelIds() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isFavoriteModel(id) {
  return getFavoriteModelIds().includes(id);
}

export function toggleFavoriteModel(id) {
  const ids = getFavoriteModelIds();
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('nexus-favorites-changed'));
  return next;
}
