const fs = require('fs');
const path = require('path');
const { app, safeStorage, BrowserWindow } = require('electron');
const brand = require('../product/brand.json');

const TOKEN_FILE = () => path.join(app.getPath('userData'), 'auth.dat');

let authWindow = null;
let onAuthExchange = null;

function cloudBases() {
  const list = [brand.defaultCloudUrl, ...(brand.fallbackCloudUrls || [])];
  return [...new Set(list.map((u) => u.replace(/\/$/, '')))];
}

async function publicFetch(apiPath, init = {}) {
  let lastErr = null;
  for (const base of cloudBases()) {
    const url = `${base}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Network error');
}

function saveTokens(access, refresh) {
  const payload = JSON.stringify({ access, refresh });
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(TOKEN_FILE(), safeStorage.encryptString(payload));
  } else {
    fs.writeFileSync(TOKEN_FILE(), payload, 'utf8');
  }
}

function loadTokens() {
  try {
    const buf = fs.readFileSync(TOKEN_FILE());
    const raw = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearTokens() {
  try {
    fs.unlinkSync(TOKEN_FILE());
  } catch {
    /* ignore */
  }
}

function getAccessToken() {
  return loadTokens()?.access || null;
}

async function refreshAccessToken() {
  const tokens = loadTokens();
  if (!tokens?.refresh) return false;
  const res = await publicFetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  saveTokens(data.access_token, data.refresh_token || tokens.refresh);
  return true;
}

async function cloudFetch(apiPath, init = {}) {
  const access = getAccessToken();
  if (!access) throw new Error('Не выполнен вход');
  const headers = { ...(init.headers || {}), Authorization: `Bearer ${access}` };
  let lastErr = null;
  for (const base of cloudBases()) {
    const url = `${base}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
    try {
      let res = await fetch(url, { ...init, headers });
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const newAccess = getAccessToken();
          res = await fetch(url, {
            ...init,
            headers: { ...(init.headers || {}), Authorization: `Bearer ${newAccess}` },
          });
        }
        if (res.status === 401) {
          clearTokens();
          const err = new Error('Сессия истекла — войдите снова');
          err.code = 'SESSION_EXPIRED';
          throw err;
        }
      }
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Network error');
}

async function completeGoogleExchange(exchangeCode) {
  const res = await publicFetch('/auth/google/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: exchangeCode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Ошибка ${res.status}`);
  }
  const data = await res.json();
  saveTokens(data.access_token, data.refresh_token);
  return data;
}

function parseAuthRedirect(url) {
  if (!url) return null;
  if (url.startsWith('nexus-browser://')) {
    try {
      const u = new URL(url);
      const exchange = u.searchParams.get('exchange');
      if (exchange) return exchange;
    } catch {
      /* ignore */
    }
  }
  try {
    const u = new URL(url);
    if (u.pathname.includes('/auth/callback')) {
      const exchange = u.searchParams.get('exchange');
      if (exchange) return exchange;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function closeAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
  }
  authWindow = null;
}

function finishAuthExchange(exchange) {
  closeAuthWindow();
  if (typeof onAuthExchange === 'function') {
    onAuthExchange(exchange);
  }
}

function attachAuthNavigationHandlers(contents) {
  const tryCapture = (url) => {
    const exchange = parseAuthRedirect(url);
    if (exchange) {
      finishAuthExchange(exchange);
      return true;
    }
    return false;
  };

  contents.on('will-redirect', (event, url) => {
    if (tryCapture(url)) event.preventDefault();
  });
  contents.on('will-navigate', (event, url) => {
    if (tryCapture(url)) event.preventDefault();
  });
  contents.on('did-navigate', (_event, url) => {
    tryCapture(url);
  });
}

/**
 * Google OAuth inside the app (modal window), not the system browser.
 */
function openGoogleSignIn(parentWindow) {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return;
  }

  const startUrl = `${cloudBases()[0]}/auth/google/start?${new URLSearchParams({
    return_to: brand.webAppUrl,
  }).toString()}`;

  authWindow = new BrowserWindow({
    width: 520,
    height: 720,
    parent: parentWindow || undefined,
    modal: Boolean(parentWindow),
    title: 'Вход в Nexus Browser',
    backgroundColor: '#07070a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  attachAuthNavigationHandlers(authWindow.webContents);
  authWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (parseAuthRedirect(url)) {
      finishAuthExchange(parseAuthRedirect(url));
      return { action: 'deny' };
    }
    authWindow.loadURL(url);
    return { action: 'deny' };
  });

  authWindow.on('closed', () => {
    authWindow = null;
  });

  authWindow.loadURL(startUrl);
}

function setAuthExchangeHandler(handler) {
  onAuthExchange = handler;
}

async function fetchProfile() {
  const res = await cloudFetch('/auth/profile');
  if (!res.ok) throw new Error(`Профиль: ${res.status}`);
  const data = await res.json();
  return data.profile ?? data;
}

module.exports = {
  getAccessToken,
  saveTokens,
  clearTokens,
  refreshAccessToken,
  cloudFetch,
  publicFetch,
  completeGoogleExchange,
  openGoogleSignIn,
  setAuthExchangeHandler,
  fetchProfile,
  cloudBases,
  brand,
};
