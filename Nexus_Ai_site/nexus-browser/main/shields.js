const path = require('path');
const fs = require('fs');
const { app, session } = require('electron');
const fetch = require('cross-fetch');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { getSettings, updateSettings } = require('./storage');

const CACHE_PATH = path.join(app.getPath('userData'), 'shields-engine.bin');
const blockers = new Map();
let blockedCount = 0;
let mainWindowRef = null;

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function siteException(hostname) {
  if (!hostname) return null;
  const settings = getSettings();
  return (settings.shieldExceptions || {})[hostname] || null;
}

function shieldsActiveForUrl(url) {
  const settings = getSettings();
  if (!settings.shieldsEnabled) return false;
  const host = getHostname(url);
  const exc = siteException(host);
  if (exc?.allowAll) return false;
  return true;
}

async function loadBlocker() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return ElectronBlocker.deserialize(fs.readFileSync(CACHE_PATH), fetch);
    }
  } catch {
    /* rebuild */
  }
  const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  try {
    fs.writeFileSync(CACHE_PATH, blocker.serialize());
  } catch {
    /* ignore */
  }
  return blocker;
}

function attachHttpsUpgrade(sess) {
  if (sess._nexusHttpsUpgrade) return;
  sess._nexusHttpsUpgrade = true;
  sess.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, callback) => {
    const settings = getSettings();
    if (!settings.httpsUpgrade || !shieldsActiveForUrl(details.url)) {
      callback({});
      return;
    }
    try {
      const u = new URL(details.url);
      u.protocol = 'https:';
      callback({ redirectURL: u.href });
    } catch {
      callback({});
    }
  });
}

function attachSaveDataFilter(sess, tabManager) {
  if (sess._nexusSaveData) return;
  sess._nexusSaveData = true;
  sess.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const settings = getSettings();
    if (!settings.performanceSaveData || !tabManager) {
      callback({});
      return;
    }
    const tab = tabManager.findTabByWebContentsId(details.webContentsId);
    if (!tab || tab.id === tabManager.activeId) {
      callback({});
      return;
    }
    if (details.resourceType === 'image' || details.resourceType === 'media') {
      callback({ cancel: true });
      return;
    }
    callback({});
  });
}

async function applyShieldsToSession(sess, tabManager) {
  if (blockers.has(sess)) {
    refreshShieldsForSession(sess);
    return blockers.get(sess);
  }
  const blocker = await loadBlocker();
  blockers.set(sess, blocker);
  let blockedFlushTimer = null;
  blocker.on('request-blocked', () => {
    blockedCount += 1;
    if (blockedFlushTimer) return;
    blockedFlushTimer = setTimeout(() => {
      blockedFlushTimer = null;
      mainWindowRef?.webContents?.send('shields:blocked', { count: blockedCount });
    }, 800);
  });
  refreshShieldsForSession(sess);
  attachHttpsUpgrade(sess);
  attachSaveDataFilter(sess, tabManager);
  return blocker;
}

function refreshShieldsForSession(sess) {
  const blocker = blockers.get(sess);
  if (!blocker) return;
  const settings = getSettings();
  if (!settings.shieldsEnabled) {
    blocker.disableBlockingInSession(sess);
    return;
  }
  blocker.enableBlockingInSession(sess);
}

async function initShields(tabManager, mainWindow) {
  mainWindowRef = mainWindow;
  const defaultSess = session.fromPartition('persist:default');
  const incognitoSess = session.fromPartition('incognito');
  await applyShieldsToSession(defaultSess, tabManager);
  await applyShieldsToSession(incognitoSess, tabManager);
}

function onSettingsChanged(tabManager) {
  blockers.forEach((_blocker, sess) => {
    refreshShieldsForSession(sess);
    attachSaveDataFilter(sess, tabManager);
  });
}

function getBlockedCount() {
  return blockedCount;
}

function resetBlockedCount() {
  blockedCount = 0;
}

function setSiteException(hostname, exception) {
  const settings = getSettings();
  const shieldExceptions = { ...(settings.shieldExceptions || {}) };
  if (!exception || exception.allowAll === false) {
    delete shieldExceptions[hostname];
  } else {
    shieldExceptions[hostname] = exception;
  }
  updateSettings({ shieldExceptions });
}

function getSiteException(hostname) {
  return siteException(hostname);
}

module.exports = {
  initShields,
  onSettingsChanged,
  getBlockedCount,
  resetBlockedCount,
  setSiteException,
  getSiteException,
  shieldsActiveForUrl,
};
