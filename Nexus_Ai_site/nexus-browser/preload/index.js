const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusBrowser', {
  tabs: {
    list: () => ipcRenderer.invoke('tabs:list'),
    create: (url, isIncognito) => ipcRenderer.invoke('tabs:create', { url, isIncognito }),
    activate: (id) => ipcRenderer.invoke('tabs:activate', id),
    close: (id) => ipcRenderer.invoke('tabs:close', id),
    reopenClosed: () => ipcRenderer.invoke('tabs:reopenClosed'),
    navigate: (tabId, input, options) => ipcRenderer.invoke('tabs:navigate', { tabId, input, options }),
    duplicate: (id) => ipcRenderer.invoke('tabs:duplicate', id),
    reorder: (tabId, toIndex) => ipcRenderer.invoke('tabs:reorder', { tabId, toIndex }),
    pin: (tabId, pinned) => ipcRenderer.invoke('tabs:pin', { tabId, pinned }),
    mute: (tabId, muted) => ipcRenderer.invoke('tabs:mute', { tabId, muted }),
    closeOthers: (id) => ipcRenderer.invoke('tabs:closeOthers', id),
    closeToRight: (id) => ipcRenderer.invoke('tabs:closeToRight', id),
    goBack: (id) => ipcRenderer.invoke('tabs:goBack', id),
    goForward: (id) => ipcRenderer.invoke('tabs:goForward', id),
    reload: (id) => ipcRenderer.invoke('tabs:reload', id),
    print: (id) => ipcRenderer.invoke('tabs:print', id),
    setZoom: (tabId, factor) => ipcRenderer.invoke('tabs:setZoom', { tabId, factor }),
    getZoom: (id) => ipcRenderer.invoke('tabs:getZoom', id),
    toggleDevTools: (id, panel) => ipcRenderer.invoke('tabs:toggleDevTools', { id, panel }),
    setGroup: (tabId, groupId) => ipcRenderer.invoke('tabs:setGroup', { tabId, groupId }),
    createGroup: (title, color) => ipcRenderer.invoke('tabs:createGroup', { title, color }),
    updateGroup: (groupId, patch) => ipcRenderer.invoke('tabs:updateGroup', { groupId, patch }),
    removeGroup: (groupId) => ipcRenderer.invoke('tabs:removeGroup', groupId),
    toggleGroupCollapsed: (groupId) => ipcRenderer.invoke('tabs:toggleGroupCollapsed', groupId),
    getGroups: () => ipcRenderer.invoke('tabs:getGroups'),
    findInPage: (tabId, text, options) => ipcRenderer.invoke('tabs:findInPage', { tabId, text, options }),
    stopFindInPage: (tabId, action) => ipcRenderer.invoke('tabs:stopFindInPage', { tabId, action }),
    onChanged: (cb) => {
      const handler = (_e, tabs) => cb(tabs);
      ipcRenderer.on('tabs:changed', handler);
      return () => ipcRenderer.removeListener('tabs:changed', handler);
    },
    onFoundInPage: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('tabs:found-in-page', handler);
      return () => ipcRenderer.removeListener('tabs:found-in-page', handler);
    },
    onInternal: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('tabs:internal', handler);
      return () => ipcRenderer.removeListener('tabs:internal', handler);
    },
  },
  downloads: {
    list: () => ipcRenderer.invoke('storage:downloads'),
    pause: (id) => ipcRenderer.invoke('downloads:pause', id),
    resume: (id) => ipcRenderer.invoke('downloads:resume', id),
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
    open: (path) => ipcRenderer.invoke('downloads:open', path),
    showInFolder: (path) => ipcRenderer.invoke('downloads:showInFolder', path),
    pickFolder: () => ipcRenderer.invoke('downloads:pickFolder'),
    onStarted: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('download:started', handler);
      return () => ipcRenderer.removeListener('download:started', handler);
    },
    onUpdated: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('download:updated', handler);
      return () => ipcRenderer.removeListener('download:updated', handler);
    },
    onDone: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('download:done', handler);
      return () => ipcRenderer.removeListener('download:done', handler);
    },
  },
  page: {
    getContext: () => ipcRenderer.invoke('page:context'),
  },
  sidebar: {
    setOpen: (open) => ipcRenderer.invoke('sidebar:setOpen', open),
  },
  chrome: {
    setHeight: (height) => ipcRenderer.invoke('chrome:setHeight', height),
    getBuildInfo: () => ipcRenderer.invoke('chrome:getBuildInfo'),
    setTitleBarTheme: (theme) => ipcRenderer.invoke('chrome:setTitleBarTheme', theme),
    setCompactMode: (compact) => ipcRenderer.invoke('chrome:setCompactMode', compact),
    pickWallpaper: () => ipcRenderer.invoke('chrome:pickWallpaper'),
  },
  window: {
    toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
    create: () => ipcRenderer.invoke('window:create'),
  },
  app: {
    quit: () => ipcRenderer.invoke('app:quit'),
  },
  sync: {
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    pull: () => ipcRenderer.invoke('sync:pull'),
    forceSync: () => ipcRenderer.invoke('sync:forceSync'),
    getRemoteTabSession: () => ipcRenderer.invoke('sync:getRemoteTabSession'),
    restoreSession: (tabs, activeIndex) =>
      ipcRenderer.invoke('sync:restoreSession', { tabs, activeIndex }),
    dismissRestore: () => ipcRenderer.invoke('sync:dismissRestore'),
    onStatusChanged: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('sync:status', handler);
      return () => ipcRenderer.removeListener('sync:status', handler);
    },
    onDataChanged: (cb) => {
      const handler = () => cb();
      ipcRenderer.on('sync:dataChanged', handler);
      return () => ipcRenderer.removeListener('sync:dataChanged', handler);
    },
  },
  auth: {
    session: () => ipcRenderer.invoke('auth:session'),
    signInGoogle: () => ipcRenderer.invoke('auth:signInGoogle'),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
    profile: () => ipcRenderer.invoke('auth:profile'),
    onChanged: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('auth:changed', handler);
      return () => ipcRenderer.removeListener('auth:changed', handler);
    },
  },
  storage: {
    settings: () => ipcRenderer.invoke('storage:settings'),
    updateSettings: (partial) => ipcRenderer.invoke('storage:settingsUpdate', partial),
    searchEngines: () => ipcRenderer.invoke('storage:searchEngines'),
    onSettingsChanged: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('settings:changed', handler);
      return () => ipcRenderer.removeListener('settings:changed', handler);
    },
    bookmarks: () => ipcRenderer.invoke('storage:bookmarks'),
    addBookmark: (entry) => ipcRenderer.invoke('storage:bookmarkAdd', entry),
    removeBookmark: (url) => ipcRenderer.invoke('storage:bookmarkRemove', url),
    importBookmarks: (html) => ipcRenderer.invoke('storage:bookmarkImport', html),
    suggest: (query) => ipcRenderer.invoke('storage:suggest', query),
    history: () => ipcRenderer.invoke('storage:history'),
    removeHistoryItem: (id) => ipcRenderer.invoke('storage:historyRemove', id),
    clearHistory: () => ipcRenderer.invoke('storage:historyClear'),
    chatGet: (tabId) => ipcRenderer.invoke('storage:chatGet', tabId),
    chatSave: (tabId, messages) => ipcRenderer.invoke('storage:chatSave', { tabId, messages }),
  },
  privacy: {
    clearBrowsingData: () => ipcRenderer.invoke('privacy:clearBrowsingData'),
  },
  agent: {
    runTool: (tool, args, autoConfirm) =>
      ipcRenderer.invoke('agent:runTool', { tool, args, autoConfirm }),
  },
  api: {
    fetch: (path, init) => ipcRenderer.invoke('api:fetch', { path, init }),
    stream: (path, body, handlers) =>
      new Promise((resolve, reject) => {
        const onChunk = (_e, raw) => {
          try {
            const data = JSON.parse(raw);
            if (data.type === 'token') handlers.onToken?.(data.content);
            else if (data.type === 'thinking') handlers.onThinking?.(data.content);
            else if (data.type === 'done') handlers.onDone?.(data);
            else if (data.type === 'error') handlers.onError?.(data.detail);
            else if (data.type === 'status') handlers.onStatus?.(data.content);
          } catch {
            /* skip */
          }
        };
        const onEnd = () => {
          cleanup();
          resolve();
        };
        const onErr = (_e, msg) => {
          cleanup();
          reject(new Error(msg));
        };
        const cleanup = () => {
          ipcRenderer.removeListener('api:stream:chunk', onChunk);
          ipcRenderer.removeListener('api:stream:end', onEnd);
          ipcRenderer.removeListener('api:stream:error', onErr);
        };
        ipcRenderer.on('api:stream:chunk', onChunk);
        ipcRenderer.on('api:stream:end', onEnd);
        ipcRenderer.on('api:stream:error', onErr);
        ipcRenderer.invoke('api:stream', { path, body }).catch((e) => {
          cleanup();
          reject(e);
        });
      }),
  },
  passwords: {
    list: () => ipcRenderer.invoke('passwords:list'),
    save: (creds) => ipcRenderer.invoke('passwords:save', creds),
    remove: (id) => ipcRenderer.invoke('passwords:remove', id),
    onPrompt: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('password:prompt', listener);
      return () => ipcRenderer.removeListener('password:prompt', listener);
    },
  },
  extensions: {
    pickAndLoad: () => ipcRenderer.invoke('extensions:pickAndLoad'),
    list: () => ipcRenderer.invoke('extensions:list'),
    remove: (id, path) => ipcRenderer.invoke('extensions:remove', { id, path }),
    installFromStore: (extensionId) => ipcRenderer.invoke('extensions:installFromStore', extensionId),
    openWebStore: () => ipcRenderer.invoke('extensions:openWebStore'),
  },
  media: {
    getActive: () => ipcRenderer.invoke('media:getActive'),
    action: (tabId, action) => ipcRenderer.invoke('media:action', { tabId, action }),
    onActiveSession: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('media:activeSession', handler);
      return () => ipcRenderer.removeListener('media:activeSession', handler);
    },
  },
  shields: {
    getStats: () => ipcRenderer.invoke('shields:getStats'),
    resetStats: () => ipcRenderer.invoke('shields:resetStats'),
    setSiteException: (hostname, exception) =>
      ipcRenderer.invoke('shields:setSiteException', { hostname, exception }),
    getSiteException: (hostname) => ipcRenderer.invoke('shields:getSiteException', hostname),
    onBlocked: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('shields:blocked', handler);
      return () => ipcRenderer.removeListener('shields:blocked', handler);
    },
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
});
