const path = require('path');
const { pathToFileURL } = require('url');
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  session,
  Menu,
  dialog,
  protocol,
  net,
  nativeImage,
} = require('electron');

const APP_ICON_PATH = path.join(__dirname, '..', 'product', 'brand', 'icon.ico');
const APP_ICON_PNG_FALLBACK = path.join(__dirname, '..', 'product', 'brand', 'icon.png');

function resolveAppIconPath() {
  if (require('fs').existsSync(APP_ICON_PATH)) return APP_ICON_PATH;
  return APP_ICON_PNG_FALLBACK;
}

function getAppIcon() {
  try {
    const image = nativeImage.createFromPath(resolveAppIconPath());
    return image.isEmpty() ? undefined : image;
  } catch {
    return undefined;
  }
}

function sameFilePath(left, right) {
  const normalize = (value) => {
    const resolved = path.normalize(path.resolve(value));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function openTrustedExternal(rawUrl) {
  const parsed = new URL(String(rawUrl || ''));
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    throw new Error('Unsupported external URL protocol');
  }
  return shell.openExternal(parsed.toString());
}
const { TabManager, NEXUS_NEWTAB } = require('./tabs');
const { getOmniboxSuggestions } = require('./omniboxSuggestions');
const auth = require('./auth');
const {
  getBookmarks,
  addBookmark,
  removeBookmark,
  importBookmarks,
  getHistory,
  clearHistory,
  removeHistoryItem,
  getSettings,
  updateSettings,
  getDownloads,
  addDownloadRecord,
  updateDownloadRecord,
  getChatSession,
  saveChatSession,
  setChatSyncExporter,
  readStore,
  writeStore,
  getRemoteTabSession,
  getLocalTabSession,
  getPasswords,
  savePassword,
  removePassword,
} = require('./storage');
const { listSearchEngines } = require('./searchEngines');
const { resolveNewTabUrl } = require('./navUtils');
const { runBrowserTool } = require('./browserAgent');
const sync = require('./sync');
const shields = require('./shields');
const mediaRegistry = require('./mediaRegistry');
const extensionsBridge = require('./extensionsBridge');

const isDev = !app.isPackaged;
const STARTUP_SYNC_DELAY_MS = 12_000;
const RENDERER_URL = isDev
  ? 'http://127.0.0.1:5174'
  : `file://${path.join(__dirname, '..', 'renderer-dist', 'index.html')}`;

let mainWindow = null;
let tabManager = null;
let pendingExchange = null;
const activeDownloadItems = new Map();

let chromeHeight = 88;

function sidebarWidth() {
  const s = getSettings();
  return Number(s.sidebarWidth) || 380;
}

function chromeBounds() {
  const [w, h] = mainWindow.getContentSize();
  const compact = mainWindow._compactMode || w < 1024;
  const sidebarOpen = !compact && mainWindow._sidebarOpen !== false;
  const rightSidebarWidth = sidebarOpen ? sidebarWidth() : 0;
  return {
    x: 0,
    y: chromeHeight,
    width: Math.max(200, w - rightSidebarWidth),
    height: Math.max(200, h - chromeHeight),
  };
}

const TITLE_BAR_OVERLAY_HEIGHT = 40;

function titleBarOverlayColors(theme) {
  const dark = theme !== 'light';
  return {
    color: dark ? '#1a1a1a' : '#f3f4f6',
    symbolColor: dark ? '#e5e7eb' : '#374151',
  };
}

function applyTitleBarOverlay(theme) {
  if (!mainWindow || process.platform !== 'win32') return;
  const colors = titleBarOverlayColors(theme);
  try {
    mainWindow.setTitleBarOverlay({
      ...colors,
      height: TITLE_BAR_OVERLAY_HEIGHT,
    });
  } catch {
    /* older Electron / non-Windows */
  }
}

function createWindow() {
  const settings = getSettings();
  const overlayColors = titleBarOverlayColors(settings.theme);
  const appIcon = getAppIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 500,
    show: false,
    title: '',
    icon: appIcon,
    backgroundColor: '#0f0f0f',
    autoHideMenuBar: true,
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? {
      ...overlayColors,
      height: TITLE_BAR_OVERLAY_HEIGHT,
    } : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
    },
  });

  mainWindow._sidebarOpen = settings.sidebarOpen !== false;
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow.isDestroyed()) mainWindow.show();
  });
  mainWindow.loadURL(RENDERER_URL);

  tabManager = new TabManager(mainWindow, chromeBounds());
  tabManager.onTabsChanged = (tabs) => {
    mainWindow?.webContents.send('tabs:changed', tabs);
    sync.onTabsChanged(tabs);
  };
  setChatSyncExporter(() => {
    const store = readStore();
    const sessions = { ...(store.chatSessionsByUrl || {}) };
    tabManager.tabs.forEach((t) => {
      const msgs = store.chatSessions?.[t.id];
      if (msgs?.length && t.url && !t.url.startsWith('nexus://')) {
        sessions[t.url] = msgs;
      }
    });
    return sessions;
  });
  tabManager.onInternalNavigate = (url) => {
    mainWindow?.webContents.send('tabs:internal', { url });
  };
  const localSession = getLocalTabSession();
  if (settings.restoreSessionOnLogin !== false && localSession?.tabs?.length) {
    tabManager.restoreSession(localSession.tabs, localSession.activeIndex);
  } else {
    tabManager.createTab(resolveNewTabUrl(settings));
  }

  mainWindow.on('resize', () => tabManager.setChromeBounds(chromeBounds()));

  if (isDev && process.env.NEXUS_BROWSER_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function scheduleStartupSync() {
  if (!auth.getAccessToken()) return;
  setTimeout(() => {
    sync.fullSync().then(() => {
      const settings = getSettings();
      mainWindow?.webContents.send('settings:changed', settings);
      mainWindow?.webContents.send('sync:status', sync.getStatus());
    }).catch(() => {});
  }, STARTUP_SYNC_DELAY_MS);
}

function registerProtocol() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('nexus-browser', process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient('nexus-browser');
  }
}

function handleProtocolUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'auth' || u.pathname.includes('auth')) {
      const exchange = u.searchParams.get('exchange');
      if (exchange) {
        pendingExchange = exchange;
        flushPendingExchange();
      }
    }
  } catch {
    /* ignore */
  }
}

function completeAuthExchange(code) {
  return auth.completeGoogleExchange(code).then(async () => {
    setTimeout(() => {
      sync.fullSync().then(() => {
        const settings = getSettings();
        mainWindow?.webContents.send('settings:changed', settings);
      }).catch(() => {});
    }, 2000);
    mainWindow?.webContents.send('auth:changed', { authorized: true });
  });
}

function flushPendingExchange() {
  if (!pendingExchange || !mainWindow) return;
  const code = pendingExchange;
  pendingExchange = null;
  completeAuthExchange(code).catch((e) => {
    console.error('auth exchange failed', e);
    mainWindow?.webContents.send('auth:changed', {
      authorized: false,
      error: e.message || 'Ошибка входа',
    });
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

auth.setAuthExchangeHandler((exchange) => {
  completeAuthExchange(exchange).catch((e) => {
    console.error('auth exchange failed', e);
    mainWindow?.webContents.send('auth:changed', {
      authorized: false,
      error: e.message || 'Ошибка входа',
    });
  });
});

app.whenReady().then(() => {
  protocol.handle('local-file', (request) => {
    const prefix = 'local-file://wallpaper/';
    const allowedPath = getSettings().wallpaperPath;
    if (!request.url.startsWith(prefix) || !allowedPath || /^https?:/i.test(allowedPath)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const requestedPath = decodeURIComponent(request.url.slice(prefix.length));
      if (!sameFilePath(requestedPath, allowedPath)) {
        return new Response('Forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(path.resolve(allowedPath)).toString());
    } catch {
      return new Response('Invalid local file URL', { status: 400 });
    }
  });

  Menu.setApplicationMenu(null);

  const suffix = auth.brand.userAgentSuffix || 'NexusBrowser/0.1';
  session.defaultSession.setUserAgent(
    `${session.defaultSession.getUserAgent()} ${suffix}`
  );

  session.defaultSession.on('will-download', (event, item) => {
    const settings = getSettings();
    const downloadsPath = settings.downloadPath || app.getPath('downloads');
    const filename = item.getFilename();

    const startDownload = (savePath) => {
      if (!savePath) {
        item.cancel();
        return;
      }
      item.setSavePath(savePath);
      attachDownloadHandlers(item, filename, savePath);
    };

    if (settings.askDownloadLocation) {
      dialog.showSaveDialog(mainWindow, {
        defaultPath: path.join(downloadsPath, filename),
        filters: [{ name: 'All Files', extensions: ['*'] }],
      }).then((result) => {
        if (result.canceled || !result.filePath) {
          item.cancel();
          return;
        }
        startDownload(result.filePath);
      });
      return;
    }

    startDownload(path.join(downloadsPath, filename));
  });

  function attachDownloadHandlers(item, filename, savePath) {

    const downloadId = String(Date.now()) + Math.random().toString().slice(2, 6);
    activeDownloadItems.set(downloadId, item);

    const record = {
      id: downloadId,
      filename,
      savePath,
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      state: 'progressing',
    };
    addDownloadRecord(record);

    mainWindow?.webContents.send('download:started', record);

    item.on('updated', (event, state) => {
      const update = {
        id: downloadId,
        state: state === 'progressing' ? (item.isPaused() ? 'paused' : 'progressing') : state,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
      };
      updateDownloadRecord(downloadId, update);
      mainWindow?.webContents.send('download:updated', update);
    });

    item.once('done', (event, state) => {
      activeDownloadItems.delete(downloadId);
      const done = {
        id: downloadId,
        state: state === 'completed' ? 'completed' : 'failed',
        receivedBytes: item.getReceivedBytes(),
      };
      updateDownloadRecord(downloadId, done);
      mainWindow?.webContents.send('download:done', done);
    });
  }

  registerProtocol();
  createWindow();
  setupIpc();
  mediaRegistry.setMainWindow(mainWindow);
  extensionsBridge.initExtensionsBridge(tabManager, mainWindow);
  extensionsBridge.hookTabManager(tabManager, mainWindow);
  (async () => {
    try {
      await extensionsBridge.installWebStore();
      await extensionsBridge.loadStoredExtensions();
    } catch (e) {
      console.error('Extensions init failed', e);
    }
    try {
      await shields.initShields(tabManager, mainWindow);
    } catch (e) {
      console.error('Shields init failed', e);
    }
  })();
  sync.setStatusNotify((status) => {
    mainWindow?.webContents.send('sync:status', status);
  });
  sync.setDataChangedNotify(() => {
    const settings = getSettings();
    mainWindow?.webContents.send('settings:changed', settings);
    mainWindow?.webContents.send('sync:dataChanged');
  });
  sync.startPeriodicSync(() => mainWindow);
  scheduleStartupSync();
  flushPendingExchange();

  const winProto = process.argv.find((a) => a.startsWith('nexus-browser://'));
  if (winProto) handleProtocolUrl(winProto);

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.on('second-instance', (_event, argv) => {
    const proto = argv.find((a) => a.startsWith('nexus-browser://'));
    if (proto) handleProtocolUrl(proto);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function setupIpc() {
  ipcMain.handle('tabs:list', () => tabManager.listTabs());
  ipcMain.handle('tabs:create', (_e, arg) => {
    const { url, isIncognito } = arg || {};
    tabManager.createTab(url || undefined, isIncognito);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:activate', (_e, id) => {
    tabManager.activateTab(id);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:close', (_e, id) => {
    tabManager.closeTab(id);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:reopenClosed', () => {
    tabManager.reopenClosedTab();
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:navigate', (_e, { tabId, input, options }) => {
    let id = tabId || tabManager.activeId;
    if (!id || !tabManager.tabs.find((t) => t.id === id)) {
      id = tabManager.createTab();
    }
    return tabManager.navigate(id, input, options || {});
  });
  ipcMain.handle('tabs:duplicate', (_e, id) => {
    tabManager.duplicateTab(id || tabManager.activeId);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:reorder', (_e, { tabId, toIndex }) => {
    tabManager.reorderTab(tabId, toIndex);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:pin', (_e, { tabId, pinned }) => {
    tabManager.pinTab(tabId || tabManager.activeId, pinned);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:mute', (_e, { tabId, muted }) => {
    tabManager.muteTab(tabId || tabManager.activeId, muted);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:closeOthers', (_e, id) => {
    tabManager.closeOtherTabs(id || tabManager.activeId);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:closeToRight', (_e, id) => {
    tabManager.closeTabsToRight(id || tabManager.activeId);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:setGroup', (_e, { tabId, groupId }) => {
    tabManager.setTabGroup(tabId, groupId);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:createGroup', (_e, { title, color }) => {
    const groupId = tabManager.createTabGroup(title, color);
    mainWindow?.webContents.send('settings:changed', getSettings());
    return { groupId, tabs: tabManager.listTabs(), groups: tabManager.getTabGroups() };
  });
  ipcMain.handle('tabs:updateGroup', (_e, { groupId, patch }) => {
    tabManager.updateTabGroup(groupId, patch);
    mainWindow?.webContents.send('settings:changed', getSettings());
    return { groups: tabManager.getTabGroups(), tabs: tabManager.listTabs() };
  });
  ipcMain.handle('tabs:removeGroup', (_e, groupId) => {
    tabManager.removeTabGroup(groupId);
    mainWindow?.webContents.send('settings:changed', getSettings());
    return { groups: tabManager.getTabGroups(), tabs: tabManager.listTabs() };
  });
  ipcMain.handle('tabs:toggleGroupCollapsed', (_e, groupId) => {
    tabManager.toggleTabGroupCollapsed(groupId);
    mainWindow?.webContents.send('settings:changed', getSettings());
    return { groups: tabManager.getTabGroups(), tabs: tabManager.listTabs() };
  });
  ipcMain.handle('tabs:getGroups', () => tabManager.getTabGroups());
  ipcMain.handle('tabs:goBack', (_e, id) => {
    tabManager.goBack(id || tabManager.activeId);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:goForward', (_e, id) => {
    tabManager.goForward(id || tabManager.activeId);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:reload', (_e, id) => {
    tabManager.reload(id || tabManager.activeId);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:print', (_e, id) => {
    tabManager.print(id || tabManager.activeId);
  });
  ipcMain.handle('tabs:setZoom', (_e, { tabId, factor }) => {
    tabManager.setZoom(tabId || tabManager.activeId, factor);
    return tabManager.listTabs();
  });
  ipcMain.handle('tabs:getZoom', (_e, id) => tabManager.getZoom(id || tabManager.activeId));
  ipcMain.handle('tabs:toggleDevTools', (_e, arg) => {
    const { id, panel } = typeof arg === 'object' && arg ? arg : { id: arg, panel: 'default' };
    tabManager.toggleDevTools(id || tabManager.activeId, panel || 'default');
  });
  ipcMain.handle('tabs:findInPage', (_e, { tabId, text, options }) => {
    tabManager.findInPage(tabId || tabManager.activeId, text, options);
  });
  ipcMain.handle('tabs:stopFindInPage', (_e, { tabId, action }) => {
    tabManager.stopFindInPage(tabId || tabManager.activeId, action);
  });
  ipcMain.handle('page:context', () => tabManager.getActivePageContext());

  ipcMain.handle('sidebar:setOpen', (_e, open) => {
    mainWindow._sidebarOpen = open;
    updateSettings({ sidebarOpen: open });
    tabManager.setChromeBounds(chromeBounds());
  });
  ipcMain.handle('chrome:setHeight', (_e, height) => {
    const measured = Math.max(64, Math.min(260, Math.round(Number(height) || 0)));
    const next = measured + 12;
    if (!measured) return;
    if (next !== chromeHeight) {
      chromeHeight = next;
      tabManager?.setChromeBounds(chromeBounds());
    }
  });
  ipcMain.handle('chrome:setTitleBarTheme', (_e, theme) => {
    applyTitleBarOverlay(theme);
  });
  ipcMain.handle('chrome:pickWallpaper', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Media Files', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('chrome:getBuildInfo', () => ({
    version: app.getVersion(),
    productName: 'Nexus Browser',
    buildStamp: process.env.BUILD_STAMP || '',
  }));
  ipcMain.handle('window:toggleFullscreen', () => {
    if (!mainWindow) return false;
    const next = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(next);
    return next;
  });
  ipcMain.handle('window:create', () => {
    createWindow();
  });
  ipcMain.handle('app:quit', () => app.quit());

  ipcMain.handle('auth:session', async () => ({
    authorized: Boolean(auth.getAccessToken()),
    cloudUrl: auth.cloudBases()[0],
    webAppUrl: auth.brand.webAppUrl,
  }));
  ipcMain.handle('auth:signInGoogle', () => auth.openGoogleSignIn(mainWindow));
  ipcMain.handle('auth:signOut', () => {
    auth.clearTokens();
    mainWindow?.webContents.send('auth:changed', { authorized: false });
    return { authorized: false };
  });
  ipcMain.handle('auth:profile', async () => {
    if (!auth.getAccessToken()) return null;
    return auth.fetchProfile();
  });

  ipcMain.handle('storage:settings', () => getSettings());
  ipcMain.handle('storage:settingsUpdate', (_e, partial) => {
    const next = updateSettings(partial);
    mainWindow?.webContents.send('settings:changed', next);
    if (partial.sidebarWidth) tabManager?.setChromeBounds(chromeBounds());
    if (partial.theme) applyTitleBarOverlay(next.theme);
    shields.onSettingsChanged(tabManager);
    sync.onSettingsChanged();
    return next;
  });
  ipcMain.handle('storage:searchEngines', () => listSearchEngines());
  ipcMain.handle('storage:bookmarks', () => getBookmarks());
  ipcMain.handle('storage:bookmarkAdd', (_e, entry) => {
    const list = addBookmark(entry);
    sync.onBookmarksChanged();
    return list;
  });
  ipcMain.handle('storage:bookmarkRemove', (_e, url) => {
    const list = removeBookmark(url);
    sync.onBookmarksChanged();
    return list;
  });
  ipcMain.handle('storage:bookmarkImport', (_e, html) => {
    const list = importBookmarks(html);
    sync.onBookmarksChanged();
    return list;
  });
  ipcMain.handle('sync:getStatus', () => sync.getStatus());
  ipcMain.handle('sync:pull', () => sync.pullSync().then((status) => {
    const settings = getSettings();
    mainWindow?.webContents.send('settings:changed', settings);
    return status;
  }));
  ipcMain.handle('sync:forceSync', () => sync.fullSync().then((status) => {
    const settings = getSettings();
    mainWindow?.webContents.send('settings:changed', settings);
    return status;
  }));
  ipcMain.handle('sync:getRemoteTabSession', () => getRemoteTabSession());
  ipcMain.handle('sync:restoreSession', (_e, { tabs, activeIndex }) => {
    tabManager?.restoreSession(tabs, activeIndex);
    sync.clearPendingSessionRestore();
    return sync.getStatus();
  });
  ipcMain.handle('sync:dismissRestore', () => {
    sync.clearPendingSessionRestore();
    return sync.getStatus();
  });
  ipcMain.handle('passwords:list', () => getPasswords());
  ipcMain.handle('passwords:save', (_e, creds) => savePassword(creds));
  ipcMain.handle('passwords:remove', (_e, id) => removePassword(id));
  ipcMain.handle('extensions:pickAndLoad', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const extPath = result.filePaths[0];
    try {
      const ext = await extensionsBridge.getBrowserSession().loadExtension(extPath, { allowFileAccess: true });
      const store = readStore();
      store.extensionPaths = store.extensionPaths || [];
      if (!store.extensionPaths.includes(extPath)) {
        store.extensionPaths.push(extPath);
        writeStore(store);
      }
      return {
        id: ext.id,
        name: ext.name,
        version: ext.version,
        path: extPath,
      };
    } catch (e) {
      throw new Error(`Ошибка загрузки расширения: ${e.message}`);
    }
  });
  ipcMain.handle('extensions:list', () => {
    const list = extensionsBridge.getBrowserSession().getAllExtensions();
    const store = readStore();
    const paths = store.extensionPaths || [];
    return list.map((ext) => {
      const extPath = paths.find((p) => p.includes(ext.name) || p.endsWith(ext.id)) || ext.path;
      return {
        id: ext.id,
        name: ext.name,
        version: ext.version,
        path: extPath,
      };
    });
  });
  ipcMain.handle('extensions:installFromStore', async (_e, extensionId) => {
    return extensionsBridge.installFromStore(extensionId);
  });
  ipcMain.handle('extensions:openWebStore', async () => {
    tabManager.createTab('https://chromewebstore.google.com/');
    return tabManager.listTabs();
  });
  ipcMain.handle('extensions:remove', (_e, { id, path }) => {
    try {
      extensionsBridge.getBrowserSession().removeExtension(id);
      const store = readStore();
      store.extensionPaths = (store.extensionPaths || []).filter((p) => p !== path);
      writeStore(store);
      return { ok: true };
    } catch (e) {
      throw new Error(`Ошибка удаления расширения: ${e.message}`);
    }
  });

  ipcMain.on('password:request-autofill', (event, origin) => {
    const tab = tabManager?.tabs.find((item) => item.view?.webContents === event.sender);
    if (!tab) return;
    try {
      if (new URL(tab.url).origin !== origin) return;
    } catch {
      return;
    }
    const list = getPasswords();
    const match = list.find((p) => p.origin === origin);
    if (match) {
      event.sender.send('password:fill', {
        username: match.username,
        password: match.password,
      });
    }
  });

  ipcMain.on('password:save-prompt', (event, { origin, username, password }) => {
    mainWindow?.webContents.send('password:prompt', { origin, username, password });
  });

  ipcMain.on('media:state', (event, payload) => {
    const tab = tabManager?.tabs.find((t) => t.view?.webContents === event.sender);
    if (!tab) return;
    mediaRegistry.updateSession(tab.id, payload);
  });

  ipcMain.handle('media:getActive', () => mediaRegistry.getActiveSession());
  ipcMain.handle('media:action', async (_e, { tabId, action }) => {
    const tab = tabManager?.tabs.find((t) => t.id === tabId);
    if (!tab?.view) return { ok: false };
    const script = action === 'play'
      ? `(() => { try { navigator.mediaSession?.metadata; document.querySelector('video,audio')?.play(); } catch(_){} })()`
      : action === 'pause'
        ? `(() => { try { document.querySelector('video,audio')?.pause(); } catch(_){} })()`
        : action === 'next'
          ? `(() => { try { navigator.mediaSession?.setActionHandler && null; } catch(_){} window.dispatchEvent(new KeyboardEvent('keydown',{key:'MediaTrackNext',code:'MediaTrackNext'})); })()`
          : `(() => { try { window.dispatchEvent(new KeyboardEvent('keydown',{key:'MediaTrackPrevious',code:'MediaTrackPrevious'})); } catch(_){} })()`;
    await tab.view.webContents.executeJavaScript(script, true).catch(() => {});
    return { ok: true };
  });

  ipcMain.handle('shields:getStats', () => ({ blocked: shields.getBlockedCount() }));
  ipcMain.handle('shields:resetStats', () => {
    shields.resetBlockedCount();
    return { blocked: 0 };
  });
  ipcMain.handle('shields:setSiteException', (_e, { hostname, exception }) => {
    shields.setSiteException(hostname, exception);
    shields.onSettingsChanged(tabManager);
    return getSettings();
  });
  ipcMain.handle('shields:getSiteException', (_e, hostname) => shields.getSiteException(hostname));
  ipcMain.handle('chrome:setCompactMode', (_e, compact) => {
    if (mainWindow) {
      mainWindow._compactMode = Boolean(compact);
      tabManager?.setChromeBounds(chromeBounds());
    }
  });
  ipcMain.handle('storage:suggest', (_e, query) => getOmniboxSuggestions(query));
  ipcMain.handle('storage:history', () => getHistory());
  ipcMain.handle('storage:historyRemove', (_e, id) => removeHistoryItem(id));
  ipcMain.handle('storage:historyClear', () => clearHistory());
  ipcMain.handle('storage:downloads', () => getDownloads());
  ipcMain.handle('storage:chatGet', (_e, tabId) => {
    const tab = tabManager?.tabs.find((t) => t.id === tabId);
    if (tab?.isIncognito) return [];
    return getChatSession(tabId, tab?.url);
  });
  ipcMain.handle('storage:chatSave', (_e, { tabId, messages }) => {
    const tab = tabManager?.tabs.find((t) => t.id === tabId);
    if (tab?.isIncognito) return [];
    const list = saveChatSession(tabId, messages, tab?.url);
    sync.onChatChanged();
    return list;
  });

  ipcMain.handle('privacy:clearBrowsingData', async () => {
    clearHistory();
    await session.defaultSession.clearStorageData();
    return { ok: true };
  });

  ipcMain.handle('downloads:pause', (_e, id) => {
    const item = activeDownloadItems.get(id);
    if (item) item.pause();
  });
  ipcMain.handle('downloads:resume', (_e, id) => {
    const item = activeDownloadItems.get(id);
    if (item) item.resume();
  });
  ipcMain.handle('downloads:cancel', (_e, id) => {
    const item = activeDownloadItems.get(id);
    if (item) item.cancel();
    activeDownloadItems.delete(id);
  });
  ipcMain.handle('downloads:open', (_e, filePath) => shell.openPath(filePath));
  ipcMain.handle('downloads:showInFolder', (_e, filePath) => shell.showItemInFolder(filePath));
  ipcMain.handle('downloads:pickFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('agent:runTool', async (_e, { tool, args, autoConfirm }) =>
    runBrowserTool(tabManager, tool, args, { autoConfirm: Boolean(autoConfirm) })
  );

  ipcMain.handle('api:fetch', async (_e, { path: apiPath, init }) => {
    try {
      const res = await auth.cloudFetch(apiPath, init || {});
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* plain */
      }
      return { ok: res.ok, status: res.status, json, text };
    } catch (e) {
      if (e.code === 'SESSION_EXPIRED') {
        mainWindow?.webContents.send('auth:changed', { authorized: false, error: e.message });
      }
      throw e;
    }
  });

  ipcMain.handle('api:stream', async (event, { path: apiPath, body }) => {
    let access = auth.getAccessToken();
    if (!access) throw new Error('Не выполнен вход');
    const bases = auth.cloudBases();

    async function doFetch(token) {
      for (const base of bases) {
        try {
          const res = await fetch(`${base}${apiPath}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
          if (res.status === 401) return { unauthorized: true };
          if (res.ok || res.status < 500) return { res };
        } catch {
          /* try next */
        }
      }
      return { res: null };
    }

    let result = await doFetch(access);
    if (result.unauthorized) {
      const refreshed = await auth.refreshAccessToken();
      if (!refreshed) {
        mainWindow?.webContents.send('auth:changed', { authorized: false, error: 'Сессия истекла' });
        event.sender.send('api:stream:error', 'Сессия истекла');
        return;
      }
      access = auth.getAccessToken();
      result = await doFetch(access);
    }

    const res = result.res;
    if (!res || !res.ok) {
      const detail = res ? await res.text() : 'network';
      event.sender.send('api:stream:error', detail);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const block of parts) {
        const line = block.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        event.sender.send('api:stream:chunk', line.slice(5).trim());
      }
    }
    event.sender.send('api:stream:end');
  });

  ipcMain.handle('shell:openExternal', (_e, url) => openTrustedExternal(url));
}

module.exports = { NEXUS_NEWTAB };
