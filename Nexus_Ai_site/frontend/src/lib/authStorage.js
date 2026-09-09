const ACCESS_KEY = 'nexus_access_token';
const REFRESH_KEY = 'nexus_refresh_token';

export function getStoredTokens() {
  try {
    return {
      accessToken: localStorage.getItem(ACCESS_KEY) || '',
      refreshToken: localStorage.getItem(REFRESH_KEY) || '',
    };
  } catch {
    return { accessToken: '', refreshToken: '' };
  }
}

export function saveStoredTokens(accessToken, refreshToken) {
  try {
    if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
    else localStorage.removeItem(ACCESS_KEY);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* private mode */
  }
}

export function clearStoredTokens() {
  saveStoredTokens('', '');
}

export function authHeaders(extra = {}) {
  const { accessToken } = getStoredTokens();
  const headers = { ...extra };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}
