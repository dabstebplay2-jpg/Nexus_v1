import { useCallback, useEffect, useState, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Plus, Volume2, VolumeX, Pin, EyeOff } from 'lucide-react';
import BrandLogo from './components/BrandLogo';
import Omnibox from './components/Omnibox';
import BrowserMenu from './components/BrowserMenu';

const Sidebar = lazy(() => import('./components/Sidebar'));
import TabContextMenu from './components/TabContextMenu';
import NewTabPage from './pages/NewTabPage';
import SettingsPage from './pages/SettingsPage';
import ExtensionsPage from './pages/ExtensionsPage';
import { useSettings } from './hooks/useSettings';
import { useBreakpoint } from './hooks/useBreakpoint';
import { omniboxSearch } from './lib/api';
import { handleBrowserShortcut } from './lib/shortcuts';
import { buildTabStripModel, TAB_GROUP_COLORS } from './lib/tabGroups';

const NEXUS_NEWTAB = 'nexus://newtab';
const NEXUS_SETTINGS = 'nexus://settings';
const NEXUS_EXTENSIONS = 'nexus://extensions';

export default function App() {
  const { settings, searchEngines, update: updateSettings } = useSettings();
  const [tabs, setTabs] = useState([]);
  const [authorized, setAuthorized] = useState(false);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [buildInfo, setBuildInfo] = useState(null);

  const [internalView, setInternalView] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [remoteTabSession, setRemoteTabSession] = useState(null);
  const [restorePrompt, setRestorePrompt] = useState(null);
  const { compact, drawerSidebar } = useBreakpoint();

  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState('');
  const [findMatchCase, setFindMatchCase] = useState(false);
  const [findWholeWord, setFindWholeWord] = useState(false);
  const [findResults, setFindResults] = useState({ activeMatchOrdinal: 0, numberOfMatches: 0 });
  const findInputRef = useRef(null);
  const omniboxRef = useRef(null);
  const chromeRef = useRef(null);
  const menuAnchorRef = useRef(null);
  const tabsRef = useRef([]);
  const activeTabIdRef = useRef(null);

  const [downloads, setDownloads] = useState([]);
  const [showDownloads, setShowDownloads] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [bookmarksList, setBookmarksList] = useState([]);
  const [bookmarkFilter, setBookmarkFilter] = useState('');
  const [historyFilter, setHistoryFilter] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiModeActive, setAiModeActive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tabMenu, setTabMenu] = useState(null);
  const [dragTabId, setDragTabId] = useState(null);
  const [toast, setToast] = useState(null);
  const [passwordPrompt, setPasswordPrompt] = useState(null);
  const [settingsSection, setSettingsSection] = useState('search');
  const [shieldsBlocked, setShieldsBlocked] = useState(0);
  const bookmarksListRef = useRef(bookmarksList);
  bookmarksListRef.current = bookmarksList;

  const activeTab = tabs.find((t) => t.active);
  const activeTabId = activeTab?.id;

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const refreshSession = useCallback(async () => {
    const session = await window.nexusBrowser.auth.session();
    setAuthorized(session.authorized);
    if (session.authorized) {
      const p = await window.nexusBrowser.auth.profile().catch(() => null);
      setProfile(p);
      setAuthError(null);
    } else {
      setProfile(null);
    }
  }, []);

  const handleTabsChanged = useCallback((newTabs) => {
    tabsRef.current = newTabs;
    setTabs(newTabs);
    const active = newTabs.find((t) => t.active);
    activeTabIdRef.current = active?.id ?? null;
    if (active?.url === NEXUS_NEWTAB) setInternalView('newtab');
    else if (active?.url === NEXUS_SETTINGS) setInternalView('settings');
    else if (active?.url === NEXUS_EXTENSIONS) setInternalView('extensions');
    else setInternalView(null);
  }, []);

  useEffect(() => {
    window.nexusBrowser.tabs.list().then(handleTabsChanged);
    window.nexusBrowser.chrome.getBuildInfo().then(setBuildInfo);
    window.nexusBrowser.downloads.list().then(setDownloads);

    const unsub = window.nexusBrowser.tabs.onChanged(handleTabsChanged);
    const unsubInternal = window.nexusBrowser.tabs.onInternal(({ url }) => {
      if (url === NEXUS_NEWTAB) setInternalView('newtab');
      else if (url === NEXUS_SETTINGS) setInternalView('settings');
      else if (url === NEXUS_EXTENSIONS) setInternalView('extensions');
    });
    refreshSession();
    window.nexusBrowser.sync?.getStatus().then(setSyncStatus).catch(() => {});
    const unsubAuth = window.nexusBrowser.auth.onChanged((data) => {
      refreshSession();
      if (data?.error) setAuthError(data.error);
    });
    const unsubSync = window.nexusBrowser.sync?.onStatusChanged?.((status) => {
      setSyncStatus(status);
      if (status?.pendingSessionRestore?.tabs?.length) {
        setRestorePrompt(status.pendingSessionRestore);
      }
    });
    const unsubSyncData = window.nexusBrowser.sync?.onDataChanged?.(() => {
      window.nexusBrowser.storage.bookmarks().then(setBookmarksList);
      window.nexusBrowser.sync.getRemoteTabSession().then(setRemoteTabSession);
    });

    const unsubDlStarted = window.nexusBrowser.downloads.onStarted((data) => {
      setDownloads((prev) => [data, ...prev]);
      setShowDownloads(true);
    });
    const unsubDlUpdated = window.nexusBrowser.downloads.onUpdated((data) => {
      setDownloads((prev) => prev.map((d) => (d.id === data.id ? { ...d, ...data } : d)));
    });
    const unsubDlDone = window.nexusBrowser.downloads.onDone((data) => {
      setDownloads((prev) => prev.map((d) => (d.id === data.id ? { ...d, ...data } : d)));
    });
    const unsubPasswordPrompt = window.nexusBrowser.passwords?.onPrompt?.((data) => {
      setPasswordPrompt(data);
    });

    const handleKeyDown = (e) => {
      const tabId = activeTabIdRef.current;
      const tabList = tabsRef.current;
      handleBrowserShortcut(e, {
        tabId,
        tabList,
        omniboxRef,
        onToggleFind: () => {
          setShowFind((prev) => {
            if (!prev) setTimeout(() => findInputRef.current?.focus(), 100);
            else if (tabId) window.nexusBrowser.tabs.stopFindInPage(tabId, 'clearSelection');
            return !prev;
          });
        },
        onStopFind: () => {},
        onNewTab: (incognito) => window.nexusBrowser.tabs.create(undefined, incognito),
        onToggleBookmarksBar: async () => {
          const s = await window.nexusBrowser.storage.settings();
          await window.nexusBrowser.storage.updateSettings({ showBookmarksBar: !s.showBookmarksBar });
        },
        onToggleBookmarksPanel: () => { setShowBookmarks((v) => !v); setShowHistory(false); },
        onToggleHistory: () => { setShowHistory(true); setShowBookmarks(false); },
        onToggleDownloads: () => setShowDownloads(true),
        onOpenPrivacy: () => {
          setSettingsSection('privacy');
          window.nexusBrowser.tabs.navigate(activeTabIdRef.current, NEXUS_SETTINGS);
        },
        onBookmark: async () => {
          const tab = tabList.find((t) => t.id === tabId);
          if (!tab || tab.isInternal) return;
          const url = tab.url;
          const exists = bookmarksListRef.current.some((b) => b.url === url);
          const list = exists
            ? await window.nexusBrowser.storage.removeBookmark(url)
            : await window.nexusBrowser.storage.addBookmark({ url, title: tab.title || url });
          setBookmarksList(list);
          showToast(exists ? 'Закладка удалена' : 'Закладка добавлена');
        },
        showToast,
      });
    };
    const unsubShields = window.nexusBrowser.shields?.onBlocked?.((data) => {
      setShieldsBlocked(data?.count || 0);
    });
    window.nexusBrowser.shields?.getStats?.().then((s) => setShieldsBlocked(s?.blocked || 0));

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsub(); unsubInternal(); unsubAuth();
      unsubDlStarted(); unsubDlUpdated(); unsubDlDone();
      unsubPasswordPrompt?.();
      unsubSync?.();
      unsubSyncData?.();
      unsubShields?.();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleTabsChanged, refreshSession]);

  useEffect(() => {
    const unsubFind = window.nexusBrowser.tabs.onFoundInPage((data) => {
      if (data.tabId === activeTabIdRef.current) {
        setFindResults({
          activeMatchOrdinal: data.activeMatchOrdinal,
          numberOfMatches: data.numberOfMatches,
        });
      }
    });
    return () => unsubFind();
  }, []);

  useEffect(() => {
    if (!settings) return;
    setSidebarOpen(settings.sidebarOpen !== false);
    const root = document.documentElement;
    root.style.setProperty('--color-accent', settings.accentColor || '#3b82f6');
    root.style.setProperty('--sidebar-width', `${settings.sidebarWidth || 380}px`);
    const fontSizes = { small: '13px', medium: '14px', large: '16px' };
    root.style.fontSize = fontSizes[settings.fontSize] || fontSizes.medium;
    let theme = settings.theme || 'dark';
    if (settings.theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.dataset.theme = theme;
    } else {
      root.dataset.theme = theme;
    }
    window.nexusBrowser.chrome.setTitleBarTheme?.(theme);
  }, [settings]);

  useEffect(() => {
    if (showHistory) window.nexusBrowser.storage.history().then(setHistoryList);
  }, [showHistory]);

  useEffect(() => {
    if (showBookmarks) window.nexusBrowser.storage.bookmarks().then(setBookmarksList);
  }, [showBookmarks]);

  useEffect(() => {
    if (syncStatus?.state === 'synced') {
      window.nexusBrowser.storage.bookmarks().then(setBookmarksList);
      window.nexusBrowser.sync.getRemoteTabSession().then(setRemoteTabSession);
    }
  }, [syncStatus?.state, syncStatus?.lastSyncAt]);

  useEffect(() => {
    window.nexusBrowser.chrome.setCompactMode?.(drawerSidebar);
  }, [drawerSidebar]);

  useEffect(() => {
    if (drawerSidebar && sidebarOpen) {
      window.nexusBrowser.sidebar.setOpen(false);
      setSidebarOpen(false);
    }
  }, [drawerSidebar]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const reportChromeHeight = () => {
      const el = chromeRef.current;
      if (!el) return;
      window.nexusBrowser.chrome.setHeight(Math.ceil(el.getBoundingClientRect().height));
    };
    reportChromeHeight();
    const observer = new ResizeObserver(reportChromeHeight);
    if (chromeRef.current) observer.observe(chromeRef.current);
    window.addEventListener('resize', reportChromeHeight);
    return () => { observer.disconnect(); window.removeEventListener('resize', reportChromeHeight); };
  }, [sidebarOpen, tabs.length, settings?.showBookmarksBar]);

  const onNavigate = (tabId, input, options) =>
    window.nexusBrowser.tabs.navigate(tabId, input, options);

  const createNewTab = async (isIncognito = false) => {
    await window.nexusBrowser.tabs.create(undefined, isIncognito);
  };

  const closeTab = async (tabId) => {
    await window.nexusBrowser.tabs.close(tabId);
  };

  const toggleSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    window.nexusBrowser.sidebar.setOpen(next);
  };

  const openSettings = async (section = 'search') => {
    setSettingsSection(section);
    await onNavigate(activeTabId, NEXUS_SETTINGS);
  };

  const renderTabChip = (t) => (
    <div
      key={t.id}
      className={`tab ${t.active ? 'active' : ''} ${t.pinned ? 'pinned' : ''} ${t.discarded ? 'discarded' : ''} tab--${settings?.tabShape || 'rounded'}`}
      style={t.groupId ? {
        borderLeftColor: TAB_GROUP_COLORS[(settings.tabGroups || []).find((g) => g.id === t.groupId)?.color] || TAB_GROUP_COLORS.blue,
        borderLeftWidth: 3,
        borderLeftStyle: 'solid',
      } : undefined}
      draggable
      onDragStart={() => setDragTabId(t.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => {
        if (dragTabId) {
          const toIdx = tabs.findIndex((x) => x.id === t.id);
          window.nexusBrowser.tabs.reorder(dragTabId, toIdx);
          setDragTabId(null);
        }
      }}
      onClick={() => window.nexusBrowser.tabs.activate(t.id)}
      onContextMenu={(e) => { e.preventDefault(); setTabMenu({ x: e.clientX, y: e.clientY, tab: t }); }}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(t.id); } }}
    >
      {t.pinned && <Pin size={10} />}
      {t.isIncognito && <EyeOff size={12} className="incognito-icon" style={{ color: 'var(--color-accent)' }} />}
      {t.url?.startsWith('http') && !t.isIncognito && (
        <img className="tab-favicon" src={getFaviconUrl(t.url)} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
      )}
      {t.isPlaying && (t.muted ? <VolumeX size={12} /> : <Volume2 size={12} />)}
      <span className="tab-title">{t.loading ? '…' : t.title || t.url}</span>
      {!t.pinned && (
        <button type="button" className="tab-close" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>×</button>
      )}
    </div>
  );

  const tabStripModel = buildTabStripModel(tabs, settings?.tabGroups || []);

  const getFaviconUrl = (url) => {
    try {
      if (url?.startsWith('nexus://')) return '';
      return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
    } catch {
      return '';
    }
  };

  const handleFindChange = (e) => {
    const text = e.target.value;
    setFindText(text);
    const opts = { forward: true, findNext: false, matchCase: findMatchCase, wordStart: findWholeWord };
    if (text) window.nexusBrowser.tabs.findInPage(activeTabId, text, opts);
    else {
      window.nexusBrowser.tabs.stopFindInPage(activeTabId, 'clearSelection');
      setFindResults({ activeMatchOrdinal: 0, numberOfMatches: 0 });
    }
  };

  const handleFindNext = (forward = true) => {
    if (findText) {
      window.nexusBrowser.tabs.findInPage(activeTabId, findText, {
        forward, findNext: true, matchCase: findMatchCase, wordStart: findWholeWord,
      });
    }
  };

  const handleFindClose = () => {
    window.nexusBrowser.tabs.stopFindInPage(activeTabId, 'clearSelection');
    setShowFind(false);
    setFindText('');
    setFindResults({ activeMatchOrdinal: 0, numberOfMatches: 0 });
  };

  const handleTabContextAction = async (action, value) => {
    if (!tabMenu?.tab) return;
    const id = tabMenu.tab.id;
    switch (action) {
      case 'reload': window.nexusBrowser.tabs.reload(id); break;
      case 'duplicate': window.nexusBrowser.tabs.duplicate(id); break;
      case 'pin': window.nexusBrowser.tabs.pin(id, value); break;
      case 'mute': window.nexusBrowser.tabs.mute(id, value); break;
      case 'close': closeTab(id); break;
      case 'closeOthers': window.nexusBrowser.tabs.closeOthers(id); break;
      case 'closeRight': window.nexusBrowser.tabs.closeToRight(id); break;
      case 'newGroup': {
        const { groupId } = await window.nexusBrowser.tabs.createGroup('Группа', 'blue');
        await window.nexusBrowser.tabs.setGroup(id, groupId);
        break;
      }
      case 'removeFromGroup': await window.nexusBrowser.tabs.setGroup(id, null); break;
      default: break;
    }
  };

  const handleNtpSearch = async (query, useAi) => {
    const nav = await onNavigate(activeTabId, query, { aiSearch: useAi });
    if (nav?.searchQuery || useAi) {
      try {
        const data = await omniboxSearch(query);
        setSearchResult(data);
        if (!sidebarOpen) {
          setSidebarOpen(true);
          window.nexusBrowser.sidebar.setOpen(true);
        }
      } catch (err) {
        setSearchResult({ error: err.message });
      }
    }
  };

  const groupedHistory = () => {
    const groups = {};
    const now = new Date();
    historyList.forEach((h) => {
      const d = new Date(h.visitedAt);
      const diff = now - d;
      let key = 'Ранее';
      if (diff < 86400000) key = 'Сегодня';
      else if (diff < 172800000) key = 'Вчера';
      if (!groups[key]) groups[key] = [];
      if (!historyFilter || (h.title || h.url).toLowerCase().includes(historyFilter.toLowerCase())) {
        groups[key].push(h);
      }
    });
    return groups;
  };

  const filteredBookmarks = bookmarksList.filter(
    (b) => !bookmarkFilter || (b.title || b.url).toLowerCase().includes(bookmarkFilter.toLowerCase())
  );

  if (!settings) {
    return <div className="app-shell loading-screen">Загрузка…</div>;
  }

  const acceptRestore = async () => {
    if (!restorePrompt?.tabs?.length) return;
    await window.nexusBrowser.sync.restoreSession(restorePrompt.tabs, restorePrompt.activeIndex);
    setRestorePrompt(null);
    showToast('Вкладки восстановлены');
  };

  const dismissRestore = async () => {
    await window.nexusBrowser.sync.dismissRestore();
    setRestorePrompt(null);
  };

  return (
    <div
      className={`app-shell ${compact ? 'app-shell--compact' : ''} ${drawerSidebar ? 'app-shell--drawer' : ''} ${activeTab?.isIncognito ? 'incognito-theme' : ''}`}
      data-theme={settings.theme}
    >
      {authError && (
        <div className="auth-banner">
          <span>{authError}</span>
          <button type="button" className="btn btn-sm" onClick={() => { setAuthError(null); window.nexusBrowser.auth.signInGoogle(); }}>Войти</button>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      {restorePrompt?.tabs?.length > 0 && (
        <div className="sync-restore-modal-backdrop">
          <div className="sync-restore-modal">
            <h3>Восстановить вкладки?</h3>
            <p>
              На {restorePrompt.deviceLabel || 'другом устройстве'} открыто {restorePrompt.tabs.length} вкладок.
              Восстановить их на этом устройстве?
            </p>
            <div className="sync-restore-actions">
              <button type="button" className="btn btn-primary" onClick={acceptRestore}>Восстановить</button>
              <button type="button" className="btn" onClick={dismissRestore}>Не сейчас</button>
            </div>
          </div>
        </div>
      )}

      <header className="chrome" ref={chromeRef}>
        {settings?.tabPosition !== 'side' && (
          <div className="tabs-row">
            {tabStripModel.map((item) => (
              item.kind === 'group' ? (
                <button
                  key={`group-${item.group.id}`}
                  type="button"
                  className={`tab-group-chip tab-group-chip--${item.group.color}`}
                  style={{ '--group-color': TAB_GROUP_COLORS[item.group.color] || TAB_GROUP_COLORS.blue }}
                  onClick={() => window.nexusBrowser.tabs.toggleGroupCollapsed(item.group.id)}
                  title={item.group.collapsed ? 'Развернуть группу' : 'Свернуть группу'}
                >
                  <span className="tab-group-dot" />
                  {item.group.title}
                  {item.group.collapsed ? ` (${tabs.filter((t) => t.groupId === item.group.id).length})` : ''}
                </button>
              ) : renderTabChip(item.tab)
            ))}
            <button type="button" className="btn btn-sm btn-icon tab-new-btn" onClick={() => createNewTab()}>
              <Plus size={14} />
            </button>
            <div className="tabs-row-spacer" aria-hidden="true" />
          </div>
        )}

        {settings.showBookmarksBar && filteredBookmarks.length > 0 && (
          <div className="bookmarks-bar">
            {filteredBookmarks.slice(0, 12).map((b) => (
              <button key={b.url} type="button" className="bookmark-bar-item" onClick={() => onNavigate(activeTabId, b.url)}>
                {b.title || b.url}
              </button>
            ))}
          </div>
        )}

        <Omnibox
          ref={omniboxRef}
          tabs={tabs}
          activeTabId={activeTabId}
          onNavigate={onNavigate}
          shieldsBlocked={shieldsBlocked}
          onOpenShields={() => openSettings('privacy')}
          onActivateMediaTab={(id) => window.nexusBrowser.tabs.activate(id)}
          onSearch={handleNtpSearch}
          searchResult={searchResult}
          setSearchResult={setSearchResult}
          bookmarksList={bookmarksList}
          setBookmarksList={setBookmarksList}
        downloads={downloads}
        showDownloads={showDownloads}
        setShowDownloads={setShowDownloads}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        showBookmarks={showBookmarks}
        setShowBookmarks={setShowBookmarks}
        sidebarOpen={sidebarOpen}
          toggleSidebar={toggleSidebar}
          settings={settings}
          searchEngines={searchEngines}
          aiModeActive={aiModeActive}
          setAiModeActive={setAiModeActive}
          profile={profile}
          authorized={authorized}
          onSignIn={() => window.nexusBrowser.auth.signInGoogle()}
          onSignOut={async () => { await window.nexusBrowser.auth.signOut(); refreshSession(); }}
          onOpenSettings={() => openSettings('search')}
          onMenuToggle={() => setMenuOpen(!menuOpen)}
          menuAnchorRef={menuAnchorRef}
          compact={compact}
        />
      </header>

      {passwordPrompt && (
        <div className="password-prompt-banner">
          <div className="password-prompt-content">
            <span>Сохранить пароль для <strong>{new URL(passwordPrompt.origin).hostname}</strong>?</span>
            <span className="password-prompt-username">Логин: {passwordPrompt.username}</span>
          </div>
          <div className="password-prompt-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={async () => {
              await window.nexusBrowser.passwords.save(passwordPrompt);
              setPasswordPrompt(null);
              showToast('Пароль сохранен');
            }}>Сохранить</button>
            <button type="button" className="btn btn-sm" onClick={() => setPasswordPrompt(null)}>Не сейчас</button>
          </div>
        </div>
      )}

      <BrowserMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={menuAnchorRef}
        profile={profile}
        authorized={authorized}
        onSignIn={() => window.nexusBrowser.auth.signInGoogle()}
        onSignOut={async () => { await window.nexusBrowser.auth.signOut(); refreshSession(); }}
        onNewTab={createNewTab}
        onNewWindow={() => window.nexusBrowser.window.create()}
        onShowHistory={() => { setShowHistory(true); setShowBookmarks(false); }}
        onShowDownloads={() => setShowDownloads(true)}
        onShowBookmarks={() => { setShowBookmarks(true); setShowHistory(false); }}
        onShowSettings={() => openSettings('search')}
        onClearData={async () => {
          if (confirm('Удалить историю, cookies и кэш?')) {
            await window.nexusBrowser.privacy.clearBrowsingData();
            setHistoryList([]);
          }
        }}
        onFind={() => { setShowFind(true); setTimeout(() => findInputRef.current?.focus(), 100); }}
        onPrint={() => window.nexusBrowser.tabs.print(activeTabId)}
        onDevTools={() => window.nexusBrowser.tabs.toggleDevTools(activeTabId)}
        onFullscreen={() => window.nexusBrowser.window.toggleFullscreen()}
        onQuit={() => window.nexusBrowser.app.quit()}
        activeTab={activeTab}
        onZoom={(dir) => {
          const z = activeTab?.zoom || 1;
          const next = dir === 'in' ? Math.min(3, z + 0.1) : Math.max(0.5, z - 0.1);
          window.nexusBrowser.tabs.setZoom(activeTabId, next);
        }}
      />

      {tabMenu && (
        <TabContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          tab={tabMenu.tab}
          onClose={() => setTabMenu(null)}
          onAction={handleTabContextAction}
        />
      )}

      <div className="main-row">
        {settings?.tabPosition === 'side' && (
          <div className="tabs-column">
            <div className="tabs-column-header">
              <BrandLogo variant="icon" className="tabs-column-brand" imgClassName="tabs-column-brand__img" alt="Nexus" />
              <button type="button" className="btn btn-sm btn-icon tab-new-btn" onClick={() => createNewTab()}>
                <Plus size={14} />
              </button>
            </div>
            <div className="tabs-column-list">
              {tabs.map((t) => (
                <div
                  key={t.id}
                  className={`tab tab--side ${t.active ? 'active' : ''} ${t.pinned ? 'pinned' : ''} ${t.isIncognito ? 'tab-incognito' : ''} tab--${settings?.tabShape || 'rounded'}`}
                  onClick={() => window.nexusBrowser.tabs.activate(t.id)}
                  onContextMenu={(e) => { e.preventDefault(); setTabMenu({ x: e.clientX, y: e.clientY, tab: t }); }}
                  onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(t.id); } }}
                >
                  {t.isIncognito && <EyeOff size={12} className="incognito-icon" style={{ color: 'var(--color-accent)' }} />}
                  {t.url?.startsWith('http') && !t.isIncognito && (
                    <img className="tab-favicon" src={getFaviconUrl(t.url)} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                  <span className="tab-title">{t.loading ? '…' : t.title || t.url}</span>
                  {!t.pinned && (
                    <button type="button" className="tab-close" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>×</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="browser-spacer">
          {internalView === 'newtab' && (
            <NewTabPage
              settings={settings}
              searchEngines={searchEngines}
              onSearch={handleNtpSearch}
              onNavigateShortcut={(url) => onNavigate(activeTabId, url)}
              onUpdateShortcuts={(ntpShortcuts) => updateSettings({ ntpShortcuts })}
            />
          )}
          {internalView === 'extensions' && <ExtensionsPage />}
          {internalView === 'settings' && (
            <SettingsPage
              initialSection={settingsSection}
              settings={settings}
              searchEngines={searchEngines}
              onUpdate={updateSettings}
              profile={profile}
              authorized={authorized}
              syncStatus={syncStatus}
              onSignIn={() => window.nexusBrowser.auth.signInGoogle()}
              onSignOut={async () => { await window.nexusBrowser.auth.signOut(); refreshSession(); }}
              onForceSync={async () => {
                const status = await window.nexusBrowser.sync.forceSync();
                setSyncStatus(status);
                const remote = await window.nexusBrowser.sync.getRemoteTabSession();
                setRemoteTabSession(remote);
                showToast(status?.error ? status.error : 'Синхронизация завершена');
              }}
              remoteTabSession={remoteTabSession}
              onOpenRemoteTab={(url) => onNavigate(activeTabId, url)}
              onRestoreRemoteSession={async (tabs, activeIndex) => {
                await window.nexusBrowser.sync.restoreSession(tabs, activeIndex);
                showToast('Вкладки восстановлены');
              }}
              buildInfo={buildInfo}
              onClearHistory={async () => {
                const h = await window.nexusBrowser.storage.clearHistory();
                setHistoryList(h);
              }}
              onClearBrowsingData={async () => {
                await window.nexusBrowser.privacy.clearBrowsingData();
                setHistoryList([]);
              }}
            />
          )}
        </div>

        {showFind && (
          <div className="find-in-page-bar">
            <input ref={findInputRef} className="find-input" placeholder="Найти…" value={findText} onChange={handleFindChange}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFindNext(!e.shiftKey); if (e.key === 'Escape') handleFindClose(); }} />
            <label className="find-opt"><input type="checkbox" checked={findMatchCase} onChange={(e) => setFindMatchCase(e.target.checked)} /> Aa</label>
            <label className="find-opt"><input type="checkbox" checked={findWholeWord} onChange={(e) => setFindWholeWord(e.target.checked)} /> Слово</label>
            <span className="find-results">{findResults.numberOfMatches > 0 ? `${findResults.activeMatchOrdinal}/${findResults.numberOfMatches}` : '0/0'}</span>
            <button type="button" className="btn btn-sm" onClick={() => handleFindNext(false)}>↑</button>
            <button type="button" className="btn btn-sm" onClick={() => handleFindNext(true)}>↓</button>
            <button type="button" className="btn btn-sm" onClick={handleFindClose}>×</button>
          </div>
        )}

        {showDownloads && (
          <div className="downloads-panel">
            <div className="panel-header">
              <span>Загрузки</span>
              <button type="button" className="btn btn-sm" onClick={() => setShowDownloads(false)}>Закрыть</button>
            </div>
            <div className="panel-body">
              {downloads.length === 0 ? <p className="muted">Нет загрузок</p> : downloads.map((dl) => {
                const pct = dl.totalBytes ? Math.round((dl.receivedBytes / dl.totalBytes) * 100) : 0;
                return (
                  <div key={dl.id} className="download-item">
                    <div className="download-info">
                      <span className="download-name">{dl.filename}</span>
                      <span className="muted">{dl.state === 'completed' ? 'Готово' : `${pct}%`}</span>
                    </div>
                    {dl.state === 'progressing' && <div className="download-progress-bar"><div className="download-progress-fill" style={{ width: `${pct}%` }} /></div>}
                    <div className="download-actions">
                      {dl.state === 'progressing' && <button type="button" className="btn btn-sm" onClick={() => window.nexusBrowser.downloads.pause(dl.id)}>Пауза</button>}
                      {dl.state === 'paused' && <button type="button" className="btn btn-sm" onClick={() => window.nexusBrowser.downloads.resume(dl.id)}>Продолжить</button>}
                      {dl.state !== 'completed' && <button type="button" className="btn btn-sm" onClick={() => window.nexusBrowser.downloads.cancel(dl.id)}>Отмена</button>}
                      {dl.savePath && dl.state === 'completed' && (
                        <>
                          <button type="button" className="btn btn-sm" onClick={() => window.nexusBrowser.downloads.open(dl.savePath)}>Открыть</button>
                          <button type="button" className="btn btn-sm" onClick={() => window.nexusBrowser.downloads.showInFolder(dl.savePath)}>Папка</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showHistory && (
          <div className="search-overlay panel-overlay">
            <div className="panel-header">
              <span>История</span>
              <input className="panel-filter" placeholder="Поиск…" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} />
              <button type="button" className="btn btn-sm" onClick={async () => { const h = await window.nexusBrowser.storage.clearHistory(); setHistoryList(h); }}>Очистить</button>
              <button type="button" className="btn btn-sm" onClick={() => setShowHistory(false)}>×</button>
            </div>
            <div className="panel-body">
              {Object.entries(groupedHistory()).map(([group, items]) => (
                <div key={group}>
                  <div className="history-group-label">{group}</div>
                  {items.map((h) => (
                    <div key={h.id || h.url} className="history-row">
                      <a href="#" onClick={(e) => { e.preventDefault(); onNavigate(activeTabId, h.url); setShowHistory(false); }}>{h.title || h.url}</a>
                      <button type="button" className="btn btn-sm" onClick={async () => { const list = await window.nexusBrowser.storage.removeHistoryItem(h.id); setHistoryList(list); }}>×</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {showBookmarks && (
          <div className="search-overlay panel-overlay">
            <div className="panel-header">
              <span>Закладки</span>
              <input className="panel-filter" placeholder="Поиск…" value={bookmarkFilter} onChange={(e) => setBookmarkFilter(e.target.value)} />
              <label className="btn btn-sm">
                Импорт
                <input type="file" accept=".html" hidden onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const html = await file.text();
                  const list = await window.nexusBrowser.storage.importBookmarks(html);
                  setBookmarksList(list);
                }} />
              </label>
              <button type="button" className="btn btn-sm" onClick={() => setShowBookmarks(false)}>×</button>
            </div>
            <div className="panel-body">
              {filteredBookmarks.map((b) => (
                <div key={b.url} className="history-row">
                  <a href="#" onClick={(e) => { e.preventDefault(); onNavigate(activeTabId, b.url); setShowBookmarks(false); }}>{b.title || b.url}</a>
                  <button type="button" className="btn btn-sm" onClick={async () => { const list = await window.nexusBrowser.storage.removeBookmark(b.url); setBookmarksList(list); }}>Удалить</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchResult && (
          <div className="search-overlay">
            <div className="search-overlay-header"><span>Ответ ИИ</span></div>
            {searchResult.error ? (
              <p className="error-text">{searchResult.error}</p>
            ) : (
              <p className="ai-reply">{searchResult.reply}</p>
            )}
            {searchResult.sources?.length > 0 && (
              <div className="search-sources">
                {searchResult.sources.slice(0, 4).map((s, i) => (
                  <a key={i} className="source-card" href="#" onClick={(e) => { e.preventDefault(); onNavigate(activeTabId, s.url); setSearchResult(null); }}>
                    <strong>{s.title || 'Источник'}</strong>
                    <span>{new URL(s.url).hostname}</span>
                  </a>
                ))}
              </div>
            )}
            <button type="button" className="btn btn-sm" onClick={() => setSearchResult(null)}>Закрыть</button>
          </div>
        )}

        {drawerSidebar && sidebarOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Закрыть панель"
            onClick={() => toggleSidebar()}
          />
        )}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              className="sidebar-motion-wrap"
              initial={window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={window.matchMedia('(prefers-reduced-motion: reduce)').matches ? undefined : { x: 24, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <Suspense fallback={<aside className="sidebar sidebar--loading"><span>Загрузка AI…</span></aside>}>
                <Sidebar
                  authorized={authorized}
                  onSignIn={() => window.nexusBrowser.auth.signInGoogle()}
                  onSignOut={async () => { await window.nexusBrowser.auth.signOut(); refreshSession(); }}
                  profile={profile}
                  activeTabId={activeTabId}
                  drawer={drawerSidebar}
                  onClose={() => toggleSidebar()}
                />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
