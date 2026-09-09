const PW_KEY = 'nexus_admin_pw';
const SERVER_KEY = 'nexus_admin_server';
const LOCAL_DB_KEY = 'nexus_admin_local_db';

export const DEFAULT_CLOUD = 'https://nexus-zeta-ruby-12.vercel.app/api';

/** Админка на Render: UI и API на одном хосте, без localhost-прокси. */
export function isHostedOnCloudApi() {
  try {
    const h = new URL(window.location.origin).hostname;
    return h.endsWith('.onrender.com');
  } catch {
    return false;
  }
}

export function getAdminPassword() {
  return sessionStorage.getItem(PW_KEY) || '';
}

export function setAdminPassword(pw) {
  if (pw) sessionStorage.setItem(PW_KEY, pw);
  else sessionStorage.removeItem(PW_KEY);
}

export function useLocalDatabase() {
  return sessionStorage.getItem(LOCAL_DB_KEY) === '1';
}

export function setUseLocalDatabase(on) {
  if (on) sessionStorage.setItem(LOCAL_DB_KEY, '1');
  else sessionStorage.removeItem(LOCAL_DB_KEY);
}

export function getServerUrl() {
  const here = window.location.origin.replace(/\/$/, '');
  if (useLocalDatabase()) {
    return here;
  }
  if (isHostedOnCloudApi()) {
    return here;
  }
  const v = (sessionStorage.getItem(SERVER_KEY) || '').trim().replace(/\/$/, '');
  if (v && v !== here) return v;
  return DEFAULT_CLOUD;
}

export function setServerUrl(url) {
  const clean = (url || '').trim().replace(/\/$/, '');
  if (clean) sessionStorage.setItem(SERVER_KEY, clean);
}

/** При старте: не оставлять «тихий» localhost после старого входа без URL облака. */
export function ensureCloudTarget() {
  const here = window.location.origin.replace(/\/$/, '');
  const saved = (sessionStorage.getItem(SERVER_KEY) || '').trim().replace(/\/$/, '');
  if (useLocalDatabase()) return;
  if (isHostedOnCloudApi()) {
    setServerUrl(here);
    return;
  }
  if (!saved || saved === here || isLocalOrigin(saved)) {
    setServerUrl(DEFAULT_CLOUD);
  }
}

function isLocalOrigin(url) {
  try {
    const h = new URL(url).hostname;
    return h === '127.0.0.1' || h === 'localhost';
  } catch {
    return false;
  }
}

export function useCloudProxy() {
  if (useLocalDatabase() || isHostedOnCloudApi()) return false;
  const target = getServerUrl();
  const here = window.location.origin;
  return target.replace(/\/$/, '') !== here.replace(/\/$/, '') && !isLocalOrigin(target);
}

function apiBase() {
  if (useCloudProxy()) {
    return `${window.location.origin}/v1/admin-cloud-proxy`;
  }
  return '/v1/local-admin';
}

export function formatApiError(res, parsed) {
  const d = parsed?.detail ?? parsed;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object') {
    if (d.message) return d.message;
    if (d.error) return String(d.error);
    return JSON.stringify(d);
  }
  return `HTTP ${res.status}`;
}

export async function probeProxyHealth(cloudUrl) {
  try {
    const r = await fetch(`${window.location.origin}/v1/admin-cloud-proxy/health`, {
      headers: cloudUrl ? { 'X-Cloud-Admin-Target': cloudUrl } : {},
    });
    return await r.json();
  } catch {
    return null;
  }
}

export async function loadBootstrap() {
  try {
    const res = await fetch('/local-admin/bootstrap.json');
    if (!res.ok) return null;
    const b = await res.json();
    if (!useLocalDatabase() && b.defaultCloudUrl) {
      const saved = (sessionStorage.getItem(SERVER_KEY) || '').trim();
      const here = window.location.origin;
      if (!saved || saved === here || isLocalOrigin(saved)) {
        setServerUrl(b.defaultCloudUrl);
      }
    }
    return b;
  } catch {
    return null;
  }
}

export async function adminFetch(path, init = {}) {
  ensureCloudTarget();
  const pw = getAdminPassword();
  const headers = {
    ...(init.headers || {}),
    'X-Admin-Password': pw,
    Accept: 'application/json',
  };
  if (useCloudProxy()) {
    headers['X-Cloud-Admin-Target'] = getServerUrl();
  }
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const base = apiBase();
  let res;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
  } catch (e) {
    throw new Error(
      useCloudProxy()
        ? `Сеть: ${e.message}. Запустите локальный сервер: .\\scripts\\start_local_admin.ps1`
        : e.message,
    );
  }
  const ct = res.headers.get('content-type') || '';
  const parsed = ct.includes('json') ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    const err = new Error(formatApiError(res, parsed));
    err.status = res.status;
    throw err;
  }
  return parsed;
}

export async function checkAdminPassword(pw) {
  const prev = getAdminPassword();
  setAdminPassword(pw);
  try {
    await adminFetch('/status');
    return true;
  } catch {
    setAdminPassword(prev);
    return false;
  }
}

// До первого React-render: не ходить в локальную БД по умолчанию
ensureCloudTarget();
