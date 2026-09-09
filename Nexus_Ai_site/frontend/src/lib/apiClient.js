import { DIRECT_CLOUD_API_BASE, getApiBase } from './api';
import { authHeaders, clearStoredTokens, getStoredTokens, saveStoredTokens } from './authStorage';

const API_FETCH_TIMEOUT_MS = 55_000;

function networkErrorMessage(path, cause) {
  const msg = cause?.message || String(cause);
  if (msg === 'Failed to fetch' || cause?.name === 'TypeError') {
    return 'Нет связи с Nexus. Проверьте интернет, обновите страницу и повторите попытку.';
  }
  if (cause?.name === 'AbortError') {
    return 'Сервер не ответил вовремя. Попробуйте ещё раз через минуту.';
  }
  return msg || 'Ошибка сети';
}

async function refreshBases() {
  const primary = await getApiBase();
  const bases = [primary];
  if (primary !== DIRECT_CLOUD_API_BASE) bases.push(DIRECT_CLOUD_API_BASE);
  return bases;
}

/** Обновить access token по refresh_token (для apiFetch / apiStream). */
export async function tryRefreshSession() {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) return false;
  for (const base of await refreshBases()) {
    try {
      const res = await fetch(`${base}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (res.status === 401) {
        clearStoredTokens();
        return false;
      }
      if (res.status === 404) continue;
      if (!res.ok) return false;
      const data = await res.json();
      saveStoredTokens(data.access_token, data.refresh_token || refreshToken);
      return true;
    } catch {
      /* try next base */
    }
  }
  return false;
}

/** fetch с Bearer и одним refresh при 401 на auth-запросах */
export async function apiFetch(path, init = {}) {
  const base = await getApiBase();
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = authHeaders(init.headers || {});
  if (init.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
  const fetchInit = { ...init, headers, signal: init.signal ?? controller.signal };

  try {
    let res = await fetch(url, fetchInit);
    if (res.status === 401) {
      const ok = await tryRefreshSession();
      if (ok) {
        const headers2 = authHeaders(init.headers || {});
        if (init.body && !headers2['Content-Type']) headers2['Content-Type'] = 'application/json';
        const retryBase = await getApiBase();
        const retryUrl = path.startsWith('http')
          ? path
          : `${retryBase}${path.startsWith('/') ? path : `/${path}`}`;
        res = await fetch(retryUrl, { ...fetchInit, headers: headers2 });
      }
    }
    return res;
  } catch (cause) {
    throw new Error(networkErrorMessage(path, cause));
  } finally {
    clearTimeout(timeoutId);
  }
}
