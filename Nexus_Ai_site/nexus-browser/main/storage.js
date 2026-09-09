const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const FILE = () => path.join(app.getPath('userData'), 'nexus-browser-store.json');

const DEFAULT_SETTINGS = {
  searchEngine: 'google',
  searchMode: 'hybrid',
  homepage: 'https://www.google.com',
  newTabPage: 'newtab',
  newTabCustomUrl: '',
  defaultZoom: 1,
  sidebarOpen: true,
  theme: 'dark',
  language: 'ru',
  downloadPath: '',
  askDownloadLocation: false,
  showBookmarksBar: false,
  accentColor: '#3b82f6',
  fontSize: 'medium',
  sidebarWidth: 380,
  ntpShortcuts: [],
  syncEnabled: true,
  syncHistory: true,
  syncChats: true,
  syncTabs: true,
  restoreSessionOnLogin: true,
  tabOrder: [],
  wallpaperType: 'none',
  wallpaperPath: '',
  wallpaperBlur: 0,
  wallpaperBrightness: 100,
  wallpaperContrast: 100,
  tabShape: 'rounded',
  tabPosition: 'top',
  showHomeButton: true,
  showDownloadsButton: true,
  showBookmarksButton: true,
  showHistoryButton: true,
  compactMode: false,
  syncMethod: 'account',
  syncSecretKey: '',
  performanceMemorySaver: true,
  performanceMemorySaverTimeout: 30,
  devToolsMode: 'bottom',
  shieldsEnabled: true,
  blockAds: true,
  blockTrackers: true,
  blockFingerprinting: false,
  httpsUpgrade: false,
  performanceMaxLiveTabs: 12,
  performanceSaveData: false,
  tabGroups: [],
  shieldExceptions: {},
  extensionStoreIds: [],
};

const SYNC_SETTINGS_KEYS = [
  'searchEngine', 'searchMode', 'homepage', 'newTabPage', 'newTabCustomUrl',
  'defaultZoom', 'sidebarOpen', 'theme', 'language', 'showBookmarksBar',
  'accentColor', 'fontSize', 'sidebarWidth', 'ntpShortcuts', 'syncEnabled',
  'syncHistory', 'syncChats', 'syncTabs', 'restoreSessionOnLogin',
  'wallpaperType', 'wallpaperPath', 'wallpaperBlur', 'wallpaperBrightness', 'wallpaperContrast',
  'tabShape', 'tabPosition', 'showHomeButton', 'showDownloadsButton', 'showBookmarksButton', 'showHistoryButton', 'compactMode',
  'syncMethod', 'performanceMemorySaver', 'performanceMemorySaverTimeout', 'devToolsMode',
  'shieldsEnabled', 'blockAds', 'blockTrackers', 'blockFingerprinting', 'httpsUpgrade',
  'performanceMaxLiveTabs', 'performanceSaveData', 'tabGroups', 'shieldExceptions', 'extensionStoreIds',
];

let chatSyncExporter = null;
let storeCache = null;

function setChatSyncExporter(fn) {
  chatSyncExporter = fn;
}

function readStore() {
  if (storeCache) return storeCache;
  try {
    const raw = fs.readFileSync(FILE(), 'utf8');
    storeCache = JSON.parse(raw);
    return storeCache;
  } catch {
    storeCache = { bookmarks: [], history: [], settings: {}, downloads: [], chatSessions: {} };
    return storeCache;
  }
}

function writeStore(data) {
  storeCache = data;
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(data, null, 2), 'utf8');
}

function getSettings() {
  const store = readStore();
  return { ...DEFAULT_SETTINGS, ...(store.settings || {}) };
}

function updateSettings(partial) {
  const store = readStore();
  store.settings = { ...DEFAULT_SETTINGS, ...(store.settings || {}), ...partial };
  store.settingsUpdatedAt = Date.now();
  writeStore(store);
  return store.settings;
}

function getSyncPayload() {
  const store = readStore();
  const settings = getSettings();
  const syncSettings = {};
  SYNC_SETTINGS_KEYS.forEach((k) => {
    if (settings[k] !== undefined) syncSettings[k] = settings[k];
  });
  const payload = {
    version: 2,
    settings: syncSettings,
    ntpShortcuts: settings.ntpShortcuts || [],
    bookmarks: store.bookmarks || [],
    updatedAt: store.syncUpdatedAt || store.settingsUpdatedAt || 0,
  };
  if (settings.syncHistory !== false) {
    payload.history = store.history || [];
  }
  if (settings.syncChats !== false) {
    payload.chatSessions = chatSyncExporter
      ? chatSyncExporter()
      : (store.chatSessionsByUrl || {});
  }
  if (settings.syncTabs !== false && store.localTabSession) {
    payload.tabSession = store.localTabSession;
  }
  return payload;
}

function applySyncPayload(payload) {
  if (!payload || typeof payload !== 'object') return getSettings();
  const store = readStore();
  store.settings = { ...DEFAULT_SETTINGS, ...(store.settings || {}) };
  if (payload.settings) {
    store.settings = { ...store.settings, ...payload.settings };
  }
  if (Array.isArray(payload.ntpShortcuts)) {
    store.settings.ntpShortcuts = payload.ntpShortcuts;
  }
  if (Array.isArray(payload.bookmarks)) {
    store.bookmarks = payload.bookmarks;
  }
  if (Array.isArray(payload.history)) {
    store.history = payload.history;
  }
  if (payload.chatSessions && typeof payload.chatSessions === 'object') {
    store.chatSessionsByUrl = {
      ...(store.chatSessionsByUrl || {}),
      ...payload.chatSessions,
    };
  }
  if (payload.remoteTabSession) {
    store.remoteTabSession = payload.remoteTabSession;
  }
  store.syncUpdatedAt = payload.updatedAt || Date.now();
  store.settingsUpdatedAt = store.syncUpdatedAt;
  writeStore(store);
  return store.settings;
}

function setLocalTabSession(session) {
  const store = readStore();
  store.localTabSession = session;
  writeStore(store);
}

function getLocalTabSession() {
  return readStore().localTabSession || null;
}

function getRemoteTabSession() {
  return readStore().remoteTabSession || null;
}

function getChatSessionsByUrl() {
  return readStore().chatSessionsByUrl || {};
}

function getSyncUpdatedAt() {
  const store = readStore();
  return store.syncUpdatedAt || store.settingsUpdatedAt || 0;
}

function setBookmarks(bookmarks) {
  const store = readStore();
  store.bookmarks = bookmarks;
  store.settingsUpdatedAt = Date.now();
  writeStore(store);
  return store.bookmarks;
}

function getBookmarks() {
  return readStore().bookmarks || [];
}

function addBookmark(entry) {
  const store = readStore();
  const bookmarks = store.bookmarks || [];
  const exists = bookmarks.find((b) => b.url === entry.url);
  if (!exists) {
    bookmarks.unshift({
      ...entry,
      folder: entry.folder || 'default',
      createdAt: Date.now(),
    });
  }
  store.bookmarks = bookmarks.slice(0, 500);
  writeStore(store);
  return store.bookmarks;
}

function removeBookmark(url) {
  const store = readStore();
  store.bookmarks = (store.bookmarks || []).filter((b) => b.url !== url);
  writeStore(store);
  return store.bookmarks;
}

function importBookmarks(html) {
  const store = readStore();
  const bookmarks = store.bookmarks || [];
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let m;
  const imported = [];
  while ((m = linkRe.exec(html)) !== null) {
    const url = m[1];
    const title = (m[2] || url).trim();
    if (!url.startsWith('http')) continue;
    if (bookmarks.some((b) => b.url === url)) continue;
    imported.push({ url, title, folder: 'imported', createdAt: Date.now() });
  }
  store.bookmarks = [...imported, ...bookmarks].slice(0, 500);
  writeStore(store);
  return store.bookmarks;
}

function getHistory() {
  return readStore().history || [];
}

function addHistory(entry) {
  const store = readStore();
  const history = store.history || [];
  const existing = history.find((h) => h.url === entry.url);
  if (existing) {
    const filtered = history.filter((h) => h.url !== entry.url);
    filtered.unshift({
      ...existing,
      ...entry,
      visitCount: (existing.visitCount || 1) + 1,
      visitedAt: Date.now(),
    });
    store.history = filtered.slice(0, 500);
  } else {
    history.unshift({
      ...entry,
      visitCount: 1,
      visitedAt: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    store.history = history.slice(0, 500);
  }
  writeStore(store);
  try { require('./sync').onHistoryChanged(); } catch { /* sync optional */ }
  return store.history;
}

function removeHistoryItem(id) {
  const store = readStore();
  store.history = (store.history || []).filter((h) => h.id !== id);
  writeStore(store);
  try { require('./sync').onHistoryChanged(); } catch { /* sync optional */ }
  return store.history;
}

function clearHistory() {
  const store = readStore();
  store.history = [];
  writeStore(store);
  try { require('./sync').onHistoryChanged(); } catch { /* sync optional */ }
  return [];
}

function getDownloads() {
  return readStore().downloads || [];
}

function addDownloadRecord(entry) {
  const store = readStore();
  const downloads = store.downloads || [];
  downloads.unshift({ ...entry, savedAt: Date.now() });
  store.downloads = downloads.slice(0, 200);
  writeStore(store);
  return store.downloads;
}

function updateDownloadRecord(id, partial) {
  const store = readStore();
  store.downloads = (store.downloads || []).map((d) => (d.id === id ? { ...d, ...partial } : d));
  writeStore(store);
  return store.downloads;
}

function getChatSession(tabId, pageUrl) {
  const store = readStore();
  const byTab = (store.chatSessions || {})[tabId];
  if (byTab?.length) return byTab;
  if (pageUrl && store.chatSessionsByUrl?.[pageUrl]?.length) {
    return store.chatSessionsByUrl[pageUrl];
  }
  return [];
}

function saveChatSession(tabId, messages, pageUrl) {
  const store = readStore();
  store.chatSessions = store.chatSessions || {};
  const sliced = messages.slice(-100);
  store.chatSessions[tabId] = sliced;
  if (pageUrl && !pageUrl.startsWith('nexus://')) {
    store.chatSessionsByUrl = store.chatSessionsByUrl || {};
    store.chatSessionsByUrl[pageUrl] = sliced;
  }
  writeStore(store);
  return sliced;
}

function getPasswords() {
  const store = readStore();
  const list = store.passwords || [];
  return list.map((p) => {
    let decryptedPassword = '';
    try {
      if (safeStorage.isEncryptionAvailable() && p.encryptedPassword) {
        decryptedPassword = safeStorage.decryptString(Buffer.from(p.encryptedPassword, 'hex'));
      } else {
        decryptedPassword = p.password || '';
      }
    } catch (e) {
      decryptedPassword = p.password || '';
    }
    return {
      id: p.id,
      origin: p.origin,
      username: p.username,
      password: decryptedPassword,
    };
  });
}

function savePassword({ origin, username, password }) {
  const store = readStore();
  store.passwords = store.passwords || [];
  store.passwords = store.passwords.filter((p) => !(p.origin === origin && p.username === username));

  let encryptedPassword = '';
  if (safeStorage.isEncryptionAvailable()) {
    try {
      encryptedPassword = safeStorage.encryptString(password).toString('hex');
    } catch (e) {
      /* ignore */
    }
  }

  store.passwords.push({
    id: String(Date.now()) + Math.random().toString().slice(2, 6),
    origin,
    username,
    encryptedPassword: encryptedPassword || undefined,
    password: encryptedPassword ? undefined : password,
    createdAt: Date.now(),
  });

  writeStore(store);
  return getPasswords();
}

function removePassword(id) {
  const store = readStore();
  store.passwords = (store.passwords || []).filter((p) => p.id !== id);
  writeStore(store);
  return getPasswords();
}

const { mergeSyncPayload } = require('./syncMerge');

function buildMergedPayload(remotePayload, remoteAt) {
  const localPayload = getSyncPayload();
  const localAt = getSyncUpdatedAt();
  return mergeSyncPayload(localPayload, remotePayload, { localAt, remoteAt });
}

module.exports = {
  DEFAULT_SETTINGS,
  SYNC_SETTINGS_KEYS,
  getSettings,
  updateSettings,
  getSyncPayload,
  applySyncPayload,
  buildMergedPayload,
  getSyncUpdatedAt,
  setChatSyncExporter,
  setLocalTabSession,
  getLocalTabSession,
  getRemoteTabSession,
  getChatSessionsByUrl,
  setBookmarks,
  getBookmarks,
  addBookmark,
  removeBookmark,
  importBookmarks,
  getHistory,
  addHistory,
  removeHistoryItem,
  clearHistory,
  getDownloads,
  addDownloadRecord,
  updateDownloadRecord,
  getChatSession,
  saveChatSession,
  getPasswords,
  savePassword,
  removePassword,
  readStore,
  writeStore,
};
