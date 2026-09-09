import { API_BASE, IS_VERCEL_HOST } from './api';

/** @returns {'demo' | 'local'} */
export async function resolveWorkspaceMode() {
  if (IS_VERCEL_HOST) return 'demo';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(
      `${API_BASE}/files/tree?path=${encodeURIComponent('C:\\nexus-ide')}`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    if (res.ok) return 'local';
  } catch {
    /* fallback demo */
  }
  return 'demo';
}
