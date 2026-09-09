const os = require('os');
const crypto = require('crypto');
const auth = require('./auth');
const {
  getSettings,
  getSyncPayload,
  applySyncPayload,
  buildMergedPayload,
  getSyncUpdatedAt,
  setLocalTabSession,
  getRemoteTabSession,
} = require('./storage');

const PACKAGE_VERSION = require('../package.json').version;

let pushTimer = null;
let tabSessionTimer = null;
let pullInterval = null;
let lastStatus = { state: 'idle', lastSyncAt: null, error: null };
let notifyStatus = null;
let notifyDataChanged = null;
let pendingSessionRestore = null;

function setStatusNotify(fn) {
  notifyStatus = fn;
}

function setDataChangedNotify(fn) {
  notifyDataChanged = fn;
}

function emitStatus(patch) {
  lastStatus = { ...lastStatus, ...patch };
  notifyStatus?.(getStatus());
}

function emitDataChanged() {
  notifyDataChanged?.();
}

function getStatus() {
  return {
    ...lastStatus,
    localUpdatedAt: getSyncUpdatedAt(),
    remoteTabSession: getRemoteTabSession(),
    pendingSessionRestore,
  };
}

function clearPendingSessionRestore() {
  pendingSessionRestore = null;
}

function encryptPayload(payload, secretKey) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(secretKey, salt, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    data: encrypted,
  };
}

function decryptPayload(encryptedObj, secretKey) {
  const salt = Buffer.from(encryptedObj.salt, 'hex');
  const iv = Buffer.from(encryptedObj.iv, 'hex');
  const key = crypto.scryptSync(secretKey, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

async function fetchRemote() {
  const settings = getSettings();
  if (settings.syncMethod === 'secret-key' && settings.syncSecretKey) {
    const hash = crypto.createHash('sha256').update(settings.syncSecretKey).digest('hex');
    const res = await fetch(`https://kvdb.io/anonymous/${hash}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const encryptedObj = await res.json();
    const decryptedPayload = decryptPayload(encryptedObj, settings.syncSecretKey);
    return { payload: decryptedPayload, updated_at: decryptedPayload.updatedAt };
  }

  const res = await auth.cloudFetch('/v1/user/browser-sync');
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

async function pushRemote(payload) {
  const settings = getSettings();
  if (settings.syncMethod === 'secret-key' && settings.syncSecretKey) {
    const hash = crypto.createHash('sha256').update(settings.syncSecretKey).digest('hex');
    const encryptedObj = encryptPayload(payload, settings.syncSecretKey);
    const res = await fetch(`https://kvdb.io/anonymous/${hash}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encryptedObj),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { updated_at: Date.now() };
  }

  const res = await auth.cloudFetch('/v1/user/browser-sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload,
      client_updated_at: getSyncUpdatedAt(),
      client_version: PACKAGE_VERSION,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

function checkPendingSessionRestore(merged) {
  const settings = getSettings();
  if (settings.restoreSessionOnLogin === false) return;
  const remoteTab = merged?.remoteTabSession || merged?.tabSession;
  if (!remoteTab?.tabs?.length) return;
  pendingSessionRestore = {
    tabs: remoteTab.tabs.filter((t) => t.url && !t.url.startsWith('nexus://')).slice(0, 30),
    activeIndex: remoteTab.activeIndex || 0,
    deviceLabel: remoteTab.deviceLabel || 'другого устройства',
    updatedAt: remoteTab.updatedAt || 0,
  };
}

async function applyMergedAndMaybePush(merged, { pushAfter = true } = {}) {
  const { remoteTabSession, tabSession, ...rest } = merged;
  applySyncPayload({
    ...rest,
    remoteTabSession: remoteTabSession || getRemoteTabSession(),
  });
  checkPendingSessionRestore(merged);
  emitDataChanged();

  if (!pushAfter) return null;

  const localPayload = getSyncPayload();
  if (tabSession) localPayload.tabSession = tabSession;
  localPayload.updatedAt = Date.now();
  return pushRemote({ payload: localPayload });
}

async function fullSync() {
  const settings = getSettings();
  const isSecretKey = settings.syncMethod === 'secret-key' && settings.syncSecretKey;
  if (!isSecretKey && !auth.getAccessToken()) {
    emitStatus({ state: 'offline', error: null });
    return getStatus();
  }
  if (settings.syncEnabled === false) {
    emitStatus({ state: 'disabled' });
    return getStatus();
  }

  emitStatus({ state: 'syncing', error: null });
  try {
    const remote = await fetchRemote();
    const localAt = getSyncUpdatedAt();
    const remoteAt = remote?.updated_at ? new Date(remote.updated_at).getTime() : 0;

    if (!remote || !remote.payload) {
      const localPayload = getSyncPayload();
      localPayload.updatedAt = Date.now();
      const saved = await pushRemote({ payload: localPayload });
      const savedAt = saved.updated_at ? new Date(saved.updated_at).getTime() : Date.now();
      applySyncPayload({ ...localPayload, updatedAt: savedAt });
      emitStatus({ state: 'synced', lastSyncAt: Date.now(), error: null });
      return getStatus();
    }

    const merged = buildMergedPayload(remote.payload, remoteAt);
    const saved = await applyMergedAndMaybePush(merged, { pushAfter: true });
    const savedAt = saved?.updated_at ? new Date(saved.updated_at).getTime() : Date.now();
    if (savedAt) {
      applySyncPayload({ ...getSyncPayload(), updatedAt: savedAt });
    }

    emitStatus({ state: 'synced', lastSyncAt: Date.now(), error: null });
    return getStatus();
  } catch (e) {
    emitStatus({ state: 'error', error: e.message || 'Ошибка синхронизации' });
    return getStatus();
  }
}

async function pullSync() {
  const settings = getSettings();
  const isSecretKey = settings.syncMethod === 'secret-key' && settings.syncSecretKey;
  if (!isSecretKey && !auth.getAccessToken()) {
    emitStatus({ state: 'offline', error: null });
    return getStatus();
  }
  if (settings.syncEnabled === false) {
    emitStatus({ state: 'disabled' });
    return getStatus();
  }

  emitStatus({ state: 'syncing', error: null });
  try {
    const remote = await fetchRemote();
    const remoteAt = remote?.updated_at ? new Date(remote.updated_at).getTime() : 0;

    if (!remote?.payload) {
      emitStatus({ state: 'synced', lastSyncAt: lastStatus.lastSyncAt, error: null });
      return getStatus();
    }

    const merged = buildMergedPayload(remote.payload, remoteAt);
    await applyMergedAndMaybePush(merged, { pushAfter: false });

    emitStatus({ state: 'synced', lastSyncAt: Date.now(), error: null });
    return getStatus();
  } catch (e) {
    emitStatus({ state: 'error', error: e.message || 'Ошибка синхронизации' });
    return getStatus();
  }
}

async function pushSync() {
  const settings = getSettings();
  const isSecretKey = settings.syncMethod === 'secret-key' && settings.syncSecretKey;
  if (!isSecretKey && !auth.getAccessToken()) return getStatus();
  if (settings.syncEnabled === false) return getStatus();

  emitStatus({ state: 'syncing', error: null });
  try {
    const localPayload = getSyncPayload();
    localPayload.updatedAt = Date.now();
    const saved = await pushRemote({ payload: localPayload });
    const remoteAt = saved.updated_at ? new Date(saved.updated_at).getTime() : Date.now();
    applySyncPayload({ ...localPayload, updatedAt: remoteAt });
    emitStatus({ state: 'synced', lastSyncAt: Date.now(), error: null });
    return getStatus();
  } catch (e) {
    emitStatus({ state: 'error', error: e.message || 'Ошибка синхронизации' });
    return getStatus();
  }
}

function schedulePush() {
  const settings = getSettings();
  const isSecretKey = settings.syncMethod === 'secret-key' && settings.syncSecretKey;
  if (!isSecretKey && !auth.getAccessToken()) return;
  if (settings.syncEnabled === false) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushSync().catch(() => {});
  }, 2500);
}

function onTabsChanged(tabs) {
  const settings = getSettings();
  if (tabSessionTimer) clearTimeout(tabSessionTimer);
  tabSessionTimer = setTimeout(() => {
    tabSessionTimer = null;
    const snapshot = {
      tabs: (tabs || [])
        .filter((t) => t.url && !t.isInternal && !t.isIncognito)
        .slice(0, 30)
        .map((t) => ({
          url: t.url,
          title: t.title || t.url,
          pinned: Boolean(t.pinned),
          groupId: t.groupId || null,
        })),
      activeIndex: Math.max(0, (tabs || []).findIndex((t) => t.active)),
      deviceLabel: os.hostname(),
      updatedAt: Date.now(),
    };
    setLocalTabSession(snapshot);
    if (settings.syncEnabled !== false && settings.syncTabs !== false) {
      schedulePush();
    }
  }, 3000);
}

function onSettingsChanged() {
  schedulePush();
}

function onBookmarksChanged() {
  schedulePush();
}

function onHistoryChanged() {
  schedulePush();
}

function onChatChanged() {
  schedulePush();
}

function startPeriodicSync(getMainWindow) {
  if (pullInterval) clearInterval(pullInterval);
  pullInterval = setInterval(() => {
    if (auth.getAccessToken()) pullSync().catch(() => {});
  }, 5 * 60 * 1000);

  const win = getMainWindow?.();
  if (win && !win._syncFocusHook) {
    win._syncFocusHook = true;
    let lastFocusPull = 0;
    win.on('focus', () => {
      const now = Date.now();
      if (now - lastFocusPull < 60_000) return;
      lastFocusPull = now;
      if (auth.getAccessToken()) pullSync().catch(() => {});
    });
  }
}

module.exports = {
  setStatusNotify,
  setDataChangedNotify,
  getStatus,
  fullSync,
  pullSync,
  pushSync,
  schedulePush,
  onSettingsChanged,
  onBookmarksChanged,
  onHistoryChanged,
  onChatChanged,
  onTabsChanged,
  startPeriodicSync,
  clearPendingSessionRestore,
};
