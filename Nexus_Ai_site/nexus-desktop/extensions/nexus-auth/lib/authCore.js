const vscode = require('vscode');

const SECRET_ACCESS = 'nexus.accessToken';
const SECRET_REFRESH = 'nexus.refreshToken';

/** Vercel /api proxy — доступен, когда Render.com блокируется провайдером. */
const CLOUD_FALLBACK_BASES = [
  'https://nexus-zeta-ruby-12.vercel.app/api',
  'https://nexus-cloud-bxcc.onrender.com/v1',
];

/** @type {vscode.ExtensionContext | null} */
let ctx = null;

const authChangedEmitter = new vscode.EventEmitter();

function cloudUrl() {
  return vscode.workspace
    .getConfiguration('nexus')
    .get('cloudUrl', 'https://nexus-zeta-ruby-12.vercel.app/api')
    .replace(/\/$/, '');
}

function cloudUrlBases() {
  const configured = cloudUrl();
  const list = [configured];
  for (const b of CLOUD_FALLBACK_BASES) {
    if (!list.includes(b)) list.push(b);
  }
  return list;
}

function hostOnly(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * @param {string} path e.g. /auth/config
 * @param {RequestInit} init
 */
async function publicCloudFetch(path, init = {}) {
  const bases = cloudUrlBases();
  let lastErr = null;
  for (const base of bases) {
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status < 500) return { res, base };
      lastErr = new Error(`HTTP ${res.status} from ${hostOnly(url)}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('fetch failed');
}

function webAppUrl() {
  return vscode.workspace.getConfiguration('nexus').get('webAppUrl', 'http://127.0.0.1:5173').replace(/\/$/, '');
}

function setContext(ctxRef) {
  ctx = ctxRef;
}

function apiErrorMessage(body, status) {
  if (!body) return `Ошибка (${status})`;
  if (typeof body.detail === 'string') return body.detail;
  if (body.detail?.message) return body.detail.message;
  if (body.message) return body.message;
  return `Ошибка (${status})`;
}

async function getAccessToken() {
  if (!ctx) return null;
  return ctx.secrets.get(SECRET_ACCESS);
}

async function getSession() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { authorized: false, accessToken: null, cloudUrl: cloudUrl(), webAppUrl: webAppUrl() };
  }
  return { authorized: true, accessToken, cloudUrl: cloudUrl(), webAppUrl: webAppUrl() };
}

function notifyAuthChanged() {
  authChangedEmitter.fire();
  vscode.commands.executeCommand('nexus.refreshProfile').then(undefined, () => {});
}

async function saveTokens(access, refresh) {
  await ctx.secrets.store(SECRET_ACCESS, access);
  if (refresh) await ctx.secrets.store(SECRET_REFRESH, refresh);
  await vscode.commands.executeCommand('setContext', 'nexus.authorized', true);
  notifyAuthChanged();
}

async function clearTokens() {
  await ctx.secrets.delete(SECRET_ACCESS);
  await ctx.secrets.delete(SECRET_REFRESH);
  await vscode.commands.executeCommand('setContext', 'nexus.authorized', false);
  notifyAuthChanged();
}

async function applyTokenResponse(data, emailHint) {
  if (!data?.access_token) throw new Error('Сервер не вернул токен');
  await saveTokens(data.access_token, data.refresh_token);
  vscode.window.showInformationMessage(
    emailHint ? `Вход выполнен: ${emailHint}` : 'Вход в Nexus выполнен'
  );
}

async function cloudFetch(path, init = {}) {
  const session = await getSession();
  if (!session.accessToken) {
    throw new Error('Не выполнен вход в Nexus');
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
    Authorization: `Bearer ${session.accessToken}`,
  };
  const { res } = await publicCloudFetch(path, { ...init, headers });
  return res;
}

async function refreshAccessToken() {
  const refresh = await ctx.secrets.get(SECRET_REFRESH);
  if (!refresh) return false;
  const { res } = await publicCloudFetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    await clearTokens();
    return false;
  }
  const data = await res.json();
  await saveTokens(data.access_token, data.refresh_token);
  return true;
}

async function cloudFetchWithRefresh(path, init) {
  let res = await cloudFetch(path, init);
  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (ok) res = await cloudFetch(path, init);
  }
  return res;
}

async function fetchAuthConfig() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const { res, base } = await publicCloudFetch('/auth/config', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      return { google_oauth_enabled: false, _networkError: true };
    }
    const data = await res.json();
    return data;
  } catch {
    return { google_oauth_enabled: false, _networkError: true };
  }
}

async function requestEmailCode(email) {
  const normalized = email.trim().toLowerCase();
  let res;
  try {
    ({ res } = await publicCloudFetch('/auth/email/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized }),
    }));
  } catch (e) {
    throw new Error(
      `Нет связи с облаком Nexus (${e?.message || 'fetch failed'}). Проверьте интернет или укажите nexus.cloudUrl = https://nexus-zeta-ruby-12.vercel.app/api`
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(body, res.status));
  }
  return normalized;
}

async function verifyEmailCode(email, code) {
  const { res } = await publicCloudFetch('/auth/email/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(body, res.status));
  }
  const data = await res.json();
  await applyTokenResponse(data, email);
  return data;
}

async function signInWithGoogle() {
  const config = await fetchAuthConfig();
  if (config._networkError) {
    throw new Error(
      'Не удалось связаться с облаком. Укажите в настройках nexus.cloudUrl = https://nexus-zeta-ruby-12.vercel.app/api'
    );
  }
  if (!config.google_oauth_enabled) {
    throw new Error('Google OAuth на сервере недоступен. Попробуйте позже.');
  }
  const bridge = `${webAppUrl()}/auth/ide-login`;
  await vscode.env.openExternal(vscode.Uri.parse(bridge));
  vscode.window.showInformationMessage(
    'В браузере войдите через Google. Затем подтвердите открытие VSCodium.'
  );
}

async function completeGoogleExchange(exchangeCode) {
  const { res } = await publicCloudFetch('/auth/google/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: exchangeCode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(body, res.status));
  }
  const data = await res.json();
  await applyTokenResponse(data);
}

async function signInWithEmailCodeInteractive() {
  const email = await vscode.window.showInputBox({
    title: 'Nexus — email',
    prompt: 'Тот же email, что на сайте Nexus',
    ignoreFocusOut: true,
    validateInput: (v) => (v && v.includes('@') ? null : 'Введите email'),
  });
  if (!email) return;
  await requestEmailCode(email);
  vscode.window.showInformationMessage(`Код отправлен на ${email}. Проверьте почту и «Спам».`);
  const code = await vscode.window.showInputBox({
    title: 'Nexus — код из письма',
    prompt: '6 цифр',
    ignoreFocusOut: true,
    validateInput: (v) => (v && /^\d{6}$/.test(v.trim()) ? null : '6 цифр'),
  });
  if (!code) return;
  await verifyEmailCode(email, code);
}

async function signIn() {
  try {
    const config = await fetchAuthConfig();
    const choices = ['$(mail) Код на email — 6 цифр из письма'];
    if (config.google_oauth_enabled) {
      choices.unshift('$(globe) Вход через Google (браузер)');
    }
    const pick = await vscode.window.showQuickPick(choices, {
      title: 'Nexus — вход',
      placeHolder: 'Как на сайте: Google или код на email (без пароля)',
      ignoreFocusOut: true,
    });
    if (!pick) return;
    if (pick.includes('Google')) await signInWithGoogle();
    else await signInWithEmailCodeInteractive();
  } catch (e) {
    vscode.window.showErrorMessage(e.message || String(e));
  }
}

async function signOut() {
  await clearTokens();
  vscode.window.showInformationMessage('Вы вышли из Nexus.');
}

async function fetchProfile() {
  const res = await cloudFetchWithRefresh('/auth/profile');
  if (!res.ok) throw new Error(`Профиль: ${res.status}`);
  const data = await res.json();
  return data.profile ?? data;
}

function getApiExports() {
  return {
    getSession,
    cloudFetch: cloudFetchWithRefresh,
    cloudUrl,
    webAppUrl,
    signIn,
    signInWithGoogle,
    signOut,
    requestEmailCode,
    verifyEmailCode,
    fetchAuthConfig,
    fetchProfile,
    onAuthChanged: authChangedEmitter.event,
  };
}

module.exports = {
  setContext,
  getApiExports,
  signIn,
  signInWithGoogle,
  signInWithEmailCodeInteractive,
  signOut,
  completeGoogleExchange,
  getSession,
  cloudFetchWithRefresh,
  fetchAuthConfig,
  fetchProfile,
  requestEmailCode,
  verifyEmailCode,
  notifyAuthChanged,
  authChangedEmitter,
  cloudUrl,
  webAppUrl,
  getAccessToken,
};
