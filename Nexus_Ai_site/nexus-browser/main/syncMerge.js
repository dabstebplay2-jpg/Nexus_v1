const MAX_HISTORY = 500;
const MAX_BOOKMARKS = 500;
const MAX_CHAT_MESSAGES = 100;

function mergeBookmarks(local = [], remote = []) {
  const map = new Map();
  [...remote, ...local].forEach((b) => {
    if (!b?.url) return;
    const prev = map.get(b.url);
    if (!prev) {
      map.set(b.url, { ...b });
      return;
    }
    const prevAt = prev.createdAt || 0;
    const nextAt = b.createdAt || 0;
    const title = (b.title || '').length >= (prev.title || '').length ? b.title : prev.title;
    map.set(b.url, {
      ...prev,
      ...b,
      title: title || b.url,
      createdAt: Math.max(prevAt, nextAt),
    });
  });
  return [...map.values()].slice(0, MAX_BOOKMARKS);
}

function mergeHistory(local = [], remote = []) {
  const map = new Map();
  [...remote, ...local].forEach((h) => {
    if (!h?.url) return;
    const prev = map.get(h.url);
    if (!prev) {
      map.set(h.url, { ...h, visitCount: h.visitCount || 1 });
      return;
    }
    map.set(h.url, {
      ...prev,
      ...h,
      title: (h.title || '').length >= (prev.title || '').length ? h.title : prev.title,
      visitCount: (prev.visitCount || 1) + (h.visitCount || 1),
      visitedAt: Math.max(prev.visitedAt || 0, h.visitedAt || 0),
      id: prev.id || h.id,
    });
  });
  return [...map.values()]
    .sort((a, b) => (b.visitedAt || 0) - (a.visitedAt || 0))
    .slice(0, MAX_HISTORY);
}

function messageKey(m) {
  return m.id || `${m.role || ''}:${m.timestamp || ''}:${(m.content || '').slice(0, 40)}`;
}

function mergeChatSessions(local = {}, remote = {}) {
  const out = { ...local };
  Object.entries(remote || {}).forEach(([key, remoteMsgs]) => {
    if (!Array.isArray(remoteMsgs)) return;
    const localMsgs = Array.isArray(out[key]) ? out[key] : [];
    const map = new Map();
    [...localMsgs, ...remoteMsgs].forEach((m) => {
      if (!m) return;
      map.set(messageKey(m), m);
    });
    out[key] = [...map.values()]
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-MAX_CHAT_MESSAGES);
  });
  return out;
}

function mergeSettings(local = {}, remote = {}, localAt = 0, remoteAt = 0) {
  if (remoteAt > localAt) return { ...local, ...remote };
  if (localAt > remoteAt) return { ...remote, ...local };
  return { ...remote, ...local };
}

function mergeSyncPayload(localPayload, remotePayload, { localAt = 0, remoteAt = 0 } = {}) {
  if (!remotePayload) return localPayload;
  if (!localPayload) return remotePayload;

  const settings = mergeSettings(
    localPayload.settings || {},
    remotePayload.settings || {},
    localAt,
    remoteAt,
  );

  const merged = {
    version: 2,
    settings,
    ntpShortcuts:
      remoteAt > localAt
        ? remotePayload.ntpShortcuts || localPayload.ntpShortcuts || []
        : localPayload.ntpShortcuts || remotePayload.ntpShortcuts || [],
    bookmarks: mergeBookmarks(localPayload.bookmarks, remotePayload.bookmarks),
    history: mergeHistory(localPayload.history, remotePayload.history),
    chatSessions: mergeChatSessions(localPayload.chatSessions, remotePayload.chatSessions),
    updatedAt: Math.max(localAt, remoteAt, localPayload.updatedAt || 0, remotePayload.updatedAt || 0),
  };

  const remoteTab = remotePayload.tabSession;
  const localTab = localPayload.tabSession;
  if (remoteTab && (!localTab || (remoteTab.updatedAt || 0) > (localTab.updatedAt || 0))) {
    merged.remoteTabSession = remoteTab;
  } else if (remoteTab) {
    merged.remoteTabSession = remoteTab;
  }
  if (localTab) merged.tabSession = localTab;

  return merged;
}

module.exports = {
  mergeBookmarks,
  mergeHistory,
  mergeChatSessions,
  mergeSettings,
  mergeSyncPayload,
};
