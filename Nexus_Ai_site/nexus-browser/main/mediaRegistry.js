const sessions = new Map();
let activeTabId = null;
let mainWindowRef = null;

function setMainWindow(win) {
  mainWindowRef = win;
}

function updateSession(tabId, payload) {
  if (!tabId) return;
  const prev = sessions.get(tabId) || {};
  const next = {
    tabId,
    title: payload.title ?? prev.title ?? '',
    artist: payload.artist ?? prev.artist ?? '',
    album: payload.album ?? prev.album ?? '',
    artwork: payload.artwork ?? prev.artwork ?? '',
    playbackState: payload.playbackState ?? prev.playbackState ?? 'none',
    audible: payload.audible ?? prev.audible ?? false,
    updatedAt: Date.now(),
  };
  sessions.set(tabId, next);
  if (payload.playbackState === 'playing' || next.audible) {
    activeTabId = tabId;
  }
  broadcast();
}

function removeSession(tabId) {
  sessions.delete(tabId);
  if (activeTabId === tabId) {
    activeTabId = pickActive();
  }
  broadcast();
}

function pickActive() {
  let best = null;
  sessions.forEach((s, id) => {
    if (s.playbackState === 'playing' || s.audible) {
      if (!best || s.updatedAt > best.updatedAt) best = { id, ...s };
    }
  });
  return best?.tabId || null;
}

function getActiveSession() {
  const id = activeTabId || pickActive();
  if (!id) return null;
  return sessions.get(id) || null;
}

function broadcast() {
  mainWindowRef?.webContents?.send('media:activeSession', getActiveSession());
}

module.exports = {
  setMainWindow,
  updateSession,
  removeSession,
  getActiveSession,
};
