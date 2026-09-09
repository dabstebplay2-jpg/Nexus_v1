const KEY = 'nexus_recent_models';
const MAX = 8;

export function getRecentModelIds() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function pushRecentModel(modelId) {
  if (!modelId) return;
  const prev = getRecentModelIds().filter((id) => id !== modelId);
  const next = [modelId, ...prev].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('nexus-recent-models-changed'));
}
