const KEY = 'nexus_appearance';

export function getAppearance() {
  try {
    return localStorage.getItem(KEY) || 'dark';
  } catch {
    return 'dark';
  }
}

export function setAppearance(mode) {
  localStorage.setItem(KEY, mode);
  applyAppearance(mode);
  window.dispatchEvent(new CustomEvent('nexus-appearance-changed', { detail: mode }));
}

export function applyAppearance(mode) {
  const root = document.documentElement;
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : mode;
  root.dataset.theme = resolved;
  root.dataset.appearance = mode;
}

export function initAppearance() {
  applyAppearance(getAppearance());
}
