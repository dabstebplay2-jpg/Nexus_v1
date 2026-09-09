const path = require('path');
const { BrowserView } = require('electron');
const { extractPageContext } = require('./pageContext');
const { addHistory, getSettings, updateSettings } = require('./storage');
const mediaRegistry = require('./mediaRegistry');
const { buildSearchUrl } = require('./searchEngines');
const {
  resolveNavigationTarget,
  resolveNewTabUrl,
  NEXUS_NEWTAB,
  NEXUS_SETTINGS,
  NEXUS_EXTENSIONS,
} = require('./navUtils');

const BANKING_BLOCK = /(bank|sberbank|tinkoff|paypal|stripe\.com\/checkout)/i;
const CHROME_BLOCK = /^chrome:|^devtools:/i;

function isInternalTabUrl(url) {
  return url === NEXUS_NEWTAB || url === NEXUS_SETTINGS || url === NEXUS_EXTENSIONS;
}

function internalTabTitle(url) {
  if (url === NEXUS_SETTINGS) return 'Настройки';
  if (url === NEXUS_EXTENSIONS) return 'Расширения';
  return 'Новая вкладка';
}

class TabManager {
  constructor(win, bounds) {
    this.win = win;
    this.bounds = bounds;
    this.tabs = [];
    this.activeId = null;
    this.nextId = 1;
    this.onInternalNavigate = null;
    this._emitTabsTimer = null;
    this.closedTabs = [];
    this._historyWriteTimer = null;
    this._lastHistoryUrl = '';

    // Start memory saver interval (checks every 30 seconds)
    this._memorySaverInterval = setInterval(() => {
      this._checkMemorySaver();
    }, 30000);
  }

  _checkMemorySaver() {
    const settings = getSettings();
    if (settings.performanceMemorySaver === false) return;

    const timeoutMs = (settings.performanceMemorySaverTimeout || 15) * 60 * 1000;
    const now = Date.now();

    this.tabs.forEach((tab) => {
      // Do not discard active tab, pinned tabs, internal tabs, or tabs that are playing audio
      if (tab.id === this.activeId || tab.pinned || isInternalTabUrl(tab.url) || tab.isPlaying) {
        return;
      }

      // If tab has a view and has been inactive/unloaded for longer than the timeout
      if (tab.view && tab.lastActiveTime && (now - tab.lastActiveTime > timeoutMs)) {
        console.log(`Discarding inactive tab ${tab.id} (${tab.title}) to save memory`);
        this._destroyBrowserView(tab);
        this._emitTabs();
      }
    });
  }

  _syncTabAudible(tab) {
    if (!tab?.view) {
      tab.isPlaying = false;
      return;
    }
    try {
      tab.isPlaying = tab.view.webContents.isCurrentlyAudible();
    } catch {
      tab.isPlaying = false;
    }
  }

  setChromeBounds(bounds) {
    this.bounds = bounds;
    this._layoutActive();
  }

  createTab(url, isIncognito = false) {
    return this._createTabRaw(url, { activate: true, isIncognito });
  }

  duplicateTab(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return null;
    return this.createTab(tab.url);
  }

  reorderTab(fromId, toIndex) {
    const fromIdx = this.tabs.findIndex((t) => t.id === fromId);
    if (fromIdx < 0) return;
    const [tab] = this.tabs.splice(fromIdx, 1);
    const pinnedCount = this.tabs.filter((t) => t.pinned).length;
    const insertAt = Math.max(pinnedCount, Math.min(toIndex, this.tabs.length));
    this.tabs.splice(insertAt, 0, tab);
    this._emitTabs();
  }

  pinTab(id, pinned) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    tab.pinned = Boolean(pinned);
    this.tabs.sort((a, b) => {
      if (a.pinned === b.pinned) return 0;
      return a.pinned ? -1 : 1;
    });
    this._emitTabs();
  }

  muteTab(id, muted) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab?.view) return;
    tab.muted = muted !== undefined ? Boolean(muted) : !tab.muted;
    tab.view.webContents.setAudioMuted(tab.muted);
    this._emitTabs();
  }

  closeOtherTabs(id) {
    const keep = this.tabs.find((t) => t.id === id);
    if (!keep) return;
    [...this.tabs].forEach((t) => {
      if (t.id !== id) this.closeTab(t.id);
    });
  }

  closeTabsToRight(id) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    [...this.tabs.slice(idx + 1)].forEach((t) => this.closeTab(t.id));
  }

  _ensureBrowserView(tab) {
    if (tab.view) return tab.view;
    this._enforceLiveViewLimit(tab);
    const view = new BrowserView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: true,
        partition: tab.isIncognito ? 'incognito' : 'persist:default',
        preload: path.join(__dirname, '..', 'preload', 'web.js'),
      },
    });
    tab.view = view;
    if (!tab._wired) {
      this._wireTab(tab);
      tab._wired = true;
    }
    if (tab.muted) view.webContents.setAudioMuted(true);
    if (tab.zoom && tab.zoom !== 1) view.webContents.setZoomFactor(tab.zoom);
    return view;
  }

  _destroyBrowserView(tab) {
    if (!tab?.view) return;
    try {
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.destroy();
    } catch {
      /* ignore */
    }
    try {
      this.win.removeBrowserView(tab.view);
    } catch {
      /* ignore */
    }
    if (this.win.getBrowserView() === tab.view) this.win.setBrowserView(null);
    tab.view = null;
  }

  _wireTab(tab) {
    const { view } = tab;
    view.webContents.on('did-start-loading', () => {
      tab.loading = true;
      if (tab.id === this.activeId) this._emitTabs();
    });
    view.webContents.on('did-stop-loading', async () => {
      tab.loading = false;
      tab.url = view.webContents.getURL();
      tab.title = view.webContents.getTitle() || tab.url;
      this._emitTabs();
      if (tab.id === this.activeId && tab.url.startsWith('http') && !tab.isIncognito) {
        this._scheduleHistoryWrite(tab.url, tab.title);
      }
    });
    view.webContents.on('did-navigate', () => {
      tab.url = view.webContents.getURL();
    });
    view.webContents.on('did-navigate-in-page', () => {
      tab.url = view.webContents.getURL();
    });
    view.webContents.on('page-title-updated', (_e, title) => {
      tab.title = title;
      if (tab.id === this.activeId) this._emitTabs();
    });
    view.webContents.on('found-in-page', (event, result) => {
      this.win.webContents.send('tabs:found-in-page', {
        tabId: tab.id,
        activeMatchOrdinal: result.activeMatchOrdinal,
        numberOfMatches: result.numberOfMatches,
      });
    });
    view.webContents.on('media-started-playing', () => {
      tab.isPlaying = true;
      this._emitTabs();
    });
    view.webContents.on('media-paused', () => {
      this._syncTabAudible(tab);
    });
    view.webContents.setWindowOpenHandler(({ url }) => {
      this.createTab(url);
      return { action: 'deny' };
    });
  }

  _scheduleHistoryWrite(url, title) {
    if (this._lastHistoryUrl === url && this._historyWriteTimer) return;
    if (this._historyWriteTimer) clearTimeout(this._historyWriteTimer);
    this._historyWriteTimer = setTimeout(() => {
      this._historyWriteTimer = null;
      this._lastHistoryUrl = url;
      addHistory({ url, title });
    }, 1200);
  }

  _layoutActive() {
    const tab = this.tabs.find((t) => t.id === this.activeId);
    this.tabs.forEach((t) => {
      if (!t.view?.webContents || t.view.webContents.isDestroyed()) return;
      try {
        t.view.webContents.setBackgroundThrottling(t.id !== this.activeId);
      } catch {
        /* ignore */
      }
    });
    if (!tab || !this.bounds) return;
    if (isInternalTabUrl(tab.url) || !tab.view) {
      this.win.setBrowserView(null);
      return;
    }
    this.win.setBrowserView(tab.view);
    tab.view.setBounds(this.bounds);
    tab.view.setAutoResize({ width: true, height: true });
    try {
      tab.view.webContents.setBackgroundThrottling(false);
    } catch {
      /* ignore */
    }
  }

  activateTab(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    
    // Set the last active time for all other tabs that are currently active
    this.tabs.forEach((t) => {
      if (t.id === this.activeId) {
        t.lastActiveTime = Date.now();
      }
    });

    this.activeId = id;
    
    // If the tab was discarded (view is null but it's an external URL), restore it
    if (!tab.view && !isInternalTabUrl(tab.url)) {
      console.log(`Restoring discarded tab ${tab.id} (${tab.title})`);
      this._ensureBrowserView(tab);
      tab.view.webContents.loadURL(tab.url);
    }

    tab.lastActiveTime = Date.now();
    this._layoutActive();
    this._emitTabs({ immediate: true });
  }

  findTabByWebContentsId(webContentsId) {
    return this.tabs.find((t) => t.view?.webContents?.id === webContentsId) || null;
  }

  _enforceLiveViewLimit(reservedTab = null) {
    const settings = getSettings();
    const max = Math.max(4, Number(settings.performanceMaxLiveTabs) || 12);
    const now = Date.now();
    const GRACE_MS = 120_000;
    const live = this.tabs.filter((t) => t.view && !isInternalTabUrl(t.url));
    const hardCap = max + 4;

    while (live.length > max) {
      let candidates = live.filter(
        (t) => t.id !== this.activeId
          && !t.pinned
          && t !== reservedTab
          && (now - (t.lastActiveTime || 0)) > GRACE_MS
      );
      if (!candidates.length) {
        if (live.length <= hardCap) break;
        candidates = live.filter((t) => t.id !== this.activeId && !t.pinned && t !== reservedTab);
      }
      if (!candidates.length) break;
      candidates.sort((a, b) => (a.lastActiveTime || 0) - (b.lastActiveTime || 0));
      const victim = candidates[0];
      this._destroyBrowserView(victim);
      live.splice(live.indexOf(victim), 1);
    }
  }

  _prefetchHost(url) {
    try {
      const host = new URL(url).hostname;
      if (!host) return;
      const { session } = require('electron');
      const sess = session.fromPartition('persist:default');
      sess.preconnect({ url: `https://${host}`, numSockets: 1 });
    } catch {
      /* ignore */
    }
  }

  _createTabRaw(url, { activate = true, isIncognito = false, deferLoad = false } = {}) {
    const settings = getSettings();
    const target = url || resolveNewTabUrl(settings);
    const id = String(this.nextId++);
    const tab = {
      id,
      view: null,
      url: target,
      title: 'Новая вкладка',
      loading: false,
      zoom: settings.defaultZoom || 1,
      pinned: false,
      muted: false,
      isIncognito: Boolean(isIncognito),
      isPlaying: false,
      groupId: null,
      _wired: false,
      lastActiveTime: Date.now(),
    };
    this.tabs.push(tab);
    if (deferLoad && !isInternalTabUrl(target)) {
      tab.url = target;
      tab.title = target;
      if (activate) this.activateTab(id);
      else this._emitTabs();
      return id;
    }
    this.navigate(id, target);
    if (activate) this.activateTab(id);
    return id;
  }

  restoreSession(tabDefs, activeIndex = 0) {
    const defs = (tabDefs || [])
      .filter((t) => t?.url && !isInternalTabUrl(t.url))
      .slice(0, 30);
    if (!defs.length) return;

    this._skipAutoNewTab = true;
    [...this.tabs].forEach((t) => this.closeTab(t.id));
    this._skipAutoNewTab = false;

    const created = defs.map((def) => this._createTabRaw(def.url, { activate: false, deferLoad: true }));
    created.forEach((id, i) => {
      if (defs[i].pinned) this.pinTab(id, true);
      if (defs[i].groupId) {
        const tab = this.tabs.find((t) => t.id === id);
        if (tab) tab.groupId = defs[i].groupId;
      }
    });

    const targetIdx = Math.min(Math.max(0, activeIndex), created.length - 1);
    if (created[targetIdx]) this.activateTab(created[targetIdx]);
    else if (created[0]) this.activateTab(created[0]);
    this._emitTabs({ immediate: true });
  }

  closeTab(id) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const [tab] = this.tabs.splice(idx, 1);
    if (tab.url && !isInternalTabUrl(tab.url) && !tab.isIncognito) {
      this.closedTabs.unshift({
        url: tab.url,
        title: tab.title || tab.url,
        pinned: Boolean(tab.pinned),
      });
      this.closedTabs = this.closedTabs.slice(0, 25);
    }
    this._destroyBrowserView(tab);
    mediaRegistry.removeSession(id);
    if (this.activeId === id) {
      const next = this.tabs[Math.max(0, idx - 1)];
      if (next) this.activateTab(next.id);
      else if (this.tabs.length === 0 && !this._skipAutoNewTab) {
        const settings = getSettings();
        this.createTab(resolveNewTabUrl(settings));
      } else {
        this.activeId = null;
      }
    }
    this._emitTabs({ immediate: true });
  }

  _loadExternalUrl(tab, url, title) {
    this._ensureBrowserView(tab);
    tab.url = url;
    tab.title = title || url;
    tab.lastActiveTime = Date.now();
    this._layoutActive();
    this._emitTabs();
    tab.view.webContents.loadURL(url);
  }

  navigate(id, input, options = {}) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const settings = getSettings();
    const resolved = resolveNavigationTarget(input);

    if (resolved.type === 'empty') return {};
    if (resolved.type === 'internal') {
      this._destroyBrowserView(tab);
      tab.url = resolved.url;
      tab.title = internalTabTitle(resolved.url);
      tab.loading = false;
      this._layoutActive();
      this._emitTabs();
      if (this.onInternalNavigate) this.onInternalNavigate(resolved.url);
      return { internal: resolved.url };
    }
    if (resolved.type === 'search') {
      const mode = options.searchMode || settings.searchMode;
      const useAi = mode === 'ai' || (mode === 'hybrid' && options.aiSearch);
      if (useAi) return { searchQuery: resolved.query };
      const serpUrl = buildSearchUrl(settings.searchEngine, resolved.query);
      this._loadExternalUrl(tab, serpUrl, resolved.query);
      return { url: serpUrl };
    }
    this._prefetchHost(resolved.url);
    this._loadExternalUrl(tab, resolved.url);
    return { url: resolved.url };
  }

  getTabGroups() {
    return getSettings().tabGroups || [];
  }

  createTabGroup(title, color = 'blue') {
    const groups = [...(getSettings().tabGroups || [])];
    const id = `g-${Date.now()}`;
    groups.push({ id, title: title || 'Группа', color, collapsed: false, order: groups.length });
    updateSettings({ tabGroups: groups });
    this._emitTabs();
    return id;
  }

  updateTabGroup(groupId, patch) {
    const groups = (getSettings().tabGroups || []).map((g) =>
      (g.id === groupId ? { ...g, ...patch } : g)
    );
    updateSettings({ tabGroups: groups });
    this._emitTabs();
  }

  removeTabGroup(groupId) {
    this.tabs.forEach((t) => {
      if (t.groupId === groupId) t.groupId = null;
    });
    const groups = (getSettings().tabGroups || []).filter((g) => g.id !== groupId);
    updateSettings({ tabGroups: groups });
    this._emitTabs();
  }

  setTabGroup(tabId, groupId) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.groupId = groupId || null;
    this._emitTabs();
  }

  toggleTabGroupCollapsed(groupId) {
    const groups = (getSettings().tabGroups || []).map((g) =>
      (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)
    );
    updateSettings({ tabGroups: groups });
    this._emitTabs();
  }

  getActiveWebContents() {
    const tab = this.tabs.find((t) => t.id === this.activeId);
    if (!tab || isInternalTabUrl(tab.url)) return null;
    return tab?.view?.webContents || null;
  }

  async getActivePageContext() {
    const wc = this.getActiveWebContents();
    if (!wc) return { url: '', title: '', excerpt: '', selection: '', tab_id: this.activeId };
    const ctx = await extractPageContext(wc);
    return { ...ctx, tab_id: this.activeId };
  }

  goBack(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (tab?.view?.webContents.canGoBack()) tab.view.webContents.goBack();
  }

  goForward(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (tab?.view?.webContents.canGoForward()) tab.view.webContents.goForward();
  }

  reopenClosedTab() {
    const def = this.closedTabs.shift();
    if (!def?.url) return null;
    return this.createTab(def.url);
  }

  reload(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (tab?.view) tab.view.webContents.reload();
  }

  print(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (tab?.view) tab.view.webContents.print({});
  }

  setZoom(id, factor) {
    const tab = this.tabs.find((t) => t.id === id);
    if (tab) {
      if (tab.view) tab.view.webContents.setZoomFactor(factor);
      tab.zoom = factor;
      this._emitTabs();
    }
  }

  getZoom(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab?.view) return tab?.zoom || 1;
    return tab.view.webContents.getZoomFactor();
  }

  toggleDevTools(id, panel = 'default') {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab?.view) return;
    const wc = tab.view.webContents;
    if (wc.isDevToolsOpened()) {
      wc.closeDevTools();
      return;
    }
    const settings = getSettings();
    const dock = settings.devToolsMode === 'detach' ? 'detach' : 'bottom';
    wc.openDevTools({ mode: dock, activate: true });
    if (panel === 'console' && wc.devToolsWebContents && !wc.devToolsWebContents.isDestroyed()) {
      wc.devToolsWebContents.executeJavaScript(`
        try {
          if (typeof DevToolsAPI !== 'undefined') DevToolsAPI.showPanel('console');
        } catch (_) {}
      `).catch(() => {});
    }
  }

  findInPage(id, text, options = {}) {
    const tab = this.tabs.find((t) => t.id === id);
    if (tab?.view && text) tab.view.webContents.findInPage(text, options);
  }

  stopFindInPage(id, action = 'clearSelection') {
    const tab = this.tabs.find((t) => t.id === id);
    if (tab?.view) tab.view.webContents.stopFindInPage(action);
  }

  listTabs() {
    return this.tabs.map((t) => {
      const isInternal = isInternalTabUrl(t.url);
      let canGoBack = false;
      let canGoForward = false;
      let isPlaying = Boolean(t.isPlaying);
      if (!isInternal && t.view && t.id === this.activeId) {
        try {
          canGoBack = t.view.webContents.canGoBack();
          canGoForward = t.view.webContents.canGoForward();
          if (t.view.webContents.isCurrentlyAudible()) {
            isPlaying = true;
            t.isPlaying = true;
          }
        } catch {
          /* ignore */
        }
      }
      return {
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.id === this.activeId,
        loading: t.loading,
        zoom: t.zoom || 1,
        pinned: Boolean(t.pinned),
        muted: Boolean(t.muted),
        isPlaying,
        canGoBack,
        canGoForward,
        isInternal,
        isIncognito: Boolean(t.isIncognito),
        groupId: t.groupId || null,
        discarded: !isInternal && !t.view && Boolean(t.url),
      };
    });
  }

  _flushEmitTabs() {
    if (this._emitTabsTimer) {
      clearTimeout(this._emitTabsTimer);
      this._emitTabsTimer = null;
    }
    if (this.onTabsChanged) this.onTabsChanged(this.listTabs());
  }

  _emitTabs({ immediate = false } = {}) {
    if (immediate) {
      this._flushEmitTabs();
      return;
    }
    if (this._emitTabsTimer) clearTimeout(this._emitTabsTimer);
    this._emitTabsTimer = setTimeout(() => {
      this._emitTabsTimer = null;
      this._flushEmitTabs();
    }, 32);
  }

  isAgentUrlAllowed(url) {
    const u = (url || '').toLowerCase();
    if (CHROME_BLOCK.test(u)) return false;
    if (BANKING_BLOCK.test(u)) return false;
    return u.startsWith('http://') || u.startsWith('https://');
  }
}

module.exports = { TabManager, NEXUS_NEWTAB, NEXUS_SETTINGS, NEXUS_EXTENSIONS };
