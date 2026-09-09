import { useState, useEffect, useRef, forwardRef } from 'react';
import {
  Sparkles, Star, Home, RotateCw, ArrowLeft, ArrowRight, Settings, MoreHorizontal, Download, History, Shield,
} from 'lucide-react';
import GlobalMediaControls from './GlobalMediaControls';
import UserAvatar from './UserAvatar';
import SuggestDropdown from './SuggestDropdown';
import OmniboxOverflowMenu from './OmniboxOverflowMenu';
import { useOmniboxSuggestions } from '../hooks/useOmniboxSuggestions';
import { omniboxSearch } from '../lib/api';

const Omnibox = forwardRef(function Omnibox({
  tabs,
  activeTabId,
  onNavigate,
  searchResult,
  setSearchResult,
  bookmarksList,
  setBookmarksList,
  downloads,
  showDownloads,
  setShowDownloads,
  showHistory,
  setShowHistory,
  showBookmarks,
  setShowBookmarks,
  sidebarOpen,
  toggleSidebar,
  settings,
  searchEngines,
  aiModeActive,
  setAiModeActive,
  onSearch,
  profile,
  authorized,
  onSignIn,
  onSignOut,
  onOpenSettings,
  onMenuToggle,
  menuAnchorRef,
  compact = false,
  shieldsBlocked = 0,
  onOpenShields,
  onActivateMediaTab,
}, inputRef) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const lastTabIdRef = useRef(null);
  const {
    suggestions,
    open: suggestOpen,
    setOpen: setSuggestOpen,
    selectedIndex,
    setSelectedIndex,
    handleFocus: handleSuggestFocus,
    handleBlur: handleSuggestBlur,
    handleKeyDown: handleSuggestKeyDown,
  } = useOmniboxSuggestions(value);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeUrl = activeTab?.url || '';
  const currentUrl = activeTab?.url || '';
  const isBookmarked = bookmarksList.some((b) => b.url === currentUrl);
  const engine = searchEngines.find((e) => e.id === settings?.searchEngine) || searchEngines[0];
  const searchMode = settings?.searchMode || 'hybrid';

  useEffect(() => {
    if (busy || !activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const tabSwitched = lastTabIdRef.current !== activeTabId;
    lastTabIdRef.current = activeTabId;

    if (tab.isInternal) {
      if (tabSwitched) setValue('');
      return;
    }
    if (tabSwitched || document.activeElement?.className !== 'omnibox') {
      setValue(tab.url === 'about:blank' ? '' : tab.url);
    }
  }, [activeTabId, activeUrl, busy, tabs]);

  const runAiSearch = async (input) => {
    setBusy(true);
    try {
      const data = await omniboxSearch(input);
      setSearchResult(data);
      if (!sidebarOpen) toggleSidebar();
    } catch (err) {
      setSearchResult({ error: err.message });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e, forceAi = false) => {
    e?.preventDefault?.();
    const input = value.trim();
    if (!input) return;
    setSearchResult(null);

    const useAi =
      forceAi ||
      aiModeActive ||
      searchMode === 'ai' ||
      (searchMode === 'hybrid' && (e?.ctrlKey || e?.metaKey));

    await navigateInput(input, useAi);
  };

  const handleAiClick = () => {
    const input = value.trim();
    if (input) {
      submit({ preventDefault: () => {} }, true);
      return;
    }
    const next = !aiModeActive;
    setAiModeActive(next);
    if (next && !sidebarOpen) toggleSidebar();
  };

  const navigateInput = async (input, useAi = false) => {
    setSearchResult(null);
    setBusy(true);
    try {
      if (onSearch && activeTab?.isInternal) {
        await onSearch(input, useAi);
        if (!useAi) setValue('');
        return;
      }
      const nav = await onNavigate(activeTabId, input, { aiSearch: useAi });
      if (nav?.searchQuery || (useAi && !nav?.url && !nav?.internal)) {
        await runAiSearch(nav?.searchQuery || input);
        return;
      }
      if (nav?.internal) return;
      if (nav?.url) setValue(nav.url);
    } finally {
      setBusy(false);
    }
  };

  const applySuggestion = async (s) => {
    setSuggestOpen(false);
    const target = s.type === 'search' ? s.query : s.url;
    if (!target) return;
    setValue(target);
    await navigateInput(target, false);
  };

  const handleHome = () => onNavigate(activeTabId, settings?.homepage || 'https://www.google.com');

  const toggleBookmark = async () => {
    if (!activeTab || activeTab.isInternal) return;
    if (isBookmarked) {
      const updated = await window.nexusBrowser.storage.removeBookmark(currentUrl);
      setBookmarksList(updated);
    } else {
      const updated = await window.nexusBrowser.storage.addBookmark({
        url: currentUrl,
        title: activeTab.title || currentUrl,
      });
      setBookmarksList(updated);
    }
  };

  const handleZoom = async (direction) => {
    if (!activeTab) return;
    const currentZoom = activeTab.zoom || 1;
    let nextZoom = currentZoom;
    if (direction === 'in') nextZoom = Math.min(3, currentZoom + 0.1);
    if (direction === 'out') nextZoom = Math.max(0.5, currentZoom - 0.1);
    if (direction === 'reset') nextZoom = 1;
    await window.nexusBrowser.tabs.setZoom(activeTabId, nextZoom);
  };

  const activeDownloadsCount = downloads.filter((d) => d.state === 'progressing').length;

  const placeholder =
    searchMode === 'hybrid'
      ? 'URL или поиск — Enter: поисковик, Ctrl+Enter: ИИ'
      : searchMode === 'ai'
        ? 'Спросите Nexus или введите URL…'
        : 'Введите URL или поисковый запрос…';

  const overflowItems = [
    { id: 'back', icon: <ArrowLeft size={14} />, label: 'Назад', disabled: !activeTab?.canGoBack, onClick: () => window.nexusBrowser.tabs.goBack(activeTabId) },
    { id: 'forward', icon: <ArrowRight size={14} />, label: 'Вперёд', disabled: !activeTab?.canGoForward, onClick: () => window.nexusBrowser.tabs.goForward(activeTabId) },
    { id: 'reload', icon: <RotateCw size={14} />, label: 'Обновить', onClick: () => window.nexusBrowser.tabs.reload(activeTabId) },
    { id: 'home', icon: <Home size={14} />, label: 'Домой', onClick: handleHome },
    { id: 'zoom-out', label: 'Уменьшить', onClick: () => handleZoom('out') },
    { id: 'zoom-reset', label: `Масштаб ${Math.round((activeTab?.zoom || 1) * 100)}%`, onClick: () => handleZoom('reset') },
    { id: 'zoom-in', label: 'Увеличить', onClick: () => handleZoom('in') },
  ];
  if (downloads.length > 0) {
    overflowItems.push({
      id: 'downloads',
      icon: <Download size={14} />,
      label: `Загрузки${activeDownloadsCount > 0 ? ` (${activeDownloadsCount})` : ''}`,
      onClick: () => setShowDownloads(!showDownloads),
    });
  }

  return (
    <div className={`omnibox-row ${compact ? 'omnibox-row--compact' : ''}`}>
      {!compact && (
      <div className="nav-buttons">
        <button type="button" className="btn btn-sm btn-icon" onClick={() => window.nexusBrowser.tabs.goBack(activeTabId)} disabled={!activeTab?.canGoBack} title="Назад">
          <ArrowLeft size={14} />
        </button>
        <button type="button" className="btn btn-sm btn-icon" onClick={() => window.nexusBrowser.tabs.goForward(activeTabId)} disabled={!activeTab?.canGoForward} title="Вперёд">
          <ArrowRight size={14} />
        </button>
        <button type="button" className="btn btn-sm btn-icon" onClick={() => window.nexusBrowser.tabs.reload(activeTabId)} title="Обновить">
          <RotateCw size={14} />
        </button>
        {settings?.showHomeButton !== false && (
          <button type="button" className="btn btn-sm btn-icon" onClick={handleHome} title="Домой">
            <Home size={14} />
          </button>
        )}
      </div>
      )}

      {compact && (
        <div className="omnibox-overflow-wrap">
          <button
            type="button"
            className="btn btn-sm btn-icon"
            onClick={() => setOverflowOpen(!overflowOpen)}
            title="Ещё"
          >
            <MoreHorizontal size={16} />
          </button>
          <OmniboxOverflowMenu
            open={overflowOpen}
            onClose={() => setOverflowOpen(false)}
            items={overflowItems}
          />
        </div>
      )}

      <div className="omnibox-container">
        {engine && <span className="omnibox-engine-icon" title={engine.name}>{engine.icon}</span>}
        {activeTab?.isIncognito && (
          <span className="omnibox-incognito-icon" title="Режим инкогнито" style={{ position: 'absolute', left: '32px', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', zIndex: 1 }}>
            <EyeOff size={14} />
          </span>
        )}
        <input
          ref={inputRef}
          className={`omnibox ${activeTab?.isIncognito ? 'omnibox--incognito' : ''}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSuggestOpen(true);
          }}
          onFocus={handleSuggestFocus}
          onBlur={handleSuggestBlur}
          onKeyDown={(e) => {
            if (handleSuggestKeyDown(e, applySuggestion)) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              submit(e, e.ctrlKey || e.metaKey);
            }
          }}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
        />
        <SuggestDropdown
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          onSelect={applySuggestion}
          onHover={setSelectedIndex}
          visible={suggestOpen}
        />
        <button
          type="button"
          className={`omnibox-ai-btn ${aiModeActive || searchMode === 'ai' ? 'active' : ''}`}
          onClick={handleAiClick}
          title={value.trim() ? 'Искать с ИИ' : 'Режим ИИ — откройте панель'}
        >
          <Sparkles size={14} />
          <span>ИИ</span>
        </button>
        <button
          type="button"
          className={`omnibox-star ${isBookmarked ? 'active' : ''}`}
          onClick={toggleBookmark}
          title={isBookmarked ? 'Удалить из закладок' : 'Добавить в закладки'}
        >
          <Star size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
        </button>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-sm omnibox-go-btn"
        disabled={busy || !value.trim()}
        onClick={(e) => submit(e, false)}
      >
        {busy ? '…' : 'Go'}
      </button>

      {!compact && (
        <div className="zoom-controls">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleZoom('out')}>−</button>
          <span className="zoom-label" onClick={() => handleZoom('reset')}>{Math.round((activeTab?.zoom || 1) * 100)}%</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleZoom('in')}>+</button>
        </div>
      )}

      {!compact && downloads.length > 0 && (
        <button
          type="button"
          className={`btn btn-sm ${showDownloads ? 'btn-primary' : ''}`}
          onClick={() => setShowDownloads(!showDownloads)}
          title="Загрузки"
        >
          ↓{activeDownloadsCount > 0 ? ` ${activeDownloadsCount}` : ''}
        </button>
      )}

      <button
        type="button"
        className={`btn btn-sm ${sidebarOpen ? 'btn-primary' : ''}`}
        onClick={toggleSidebar}
        title="ИИ-панель"
      >
        <Sparkles size={14} />
      </button>

      {!compact && (
        <button
          type="button"
          className={`btn btn-sm btn-icon shields-btn ${settings?.shieldsEnabled !== false ? 'active' : ''}`}
          onClick={onOpenShields}
          title={`Nexus Shields${shieldsBlocked ? ` — заблокировано: ${shieldsBlocked}` : ''}`}
        >
          <Shield size={14} />
          {shieldsBlocked > 0 && <span className="shields-count">{shieldsBlocked > 99 ? '99+' : shieldsBlocked}</span>}
        </button>
      )}

      <GlobalMediaControls onActivateTab={onActivateMediaTab} />

      <div className={`chrome-trailing ${compact ? 'chrome-trailing--compact' : ''}`}>
        {!compact && settings?.showHistoryButton !== false && (
          <button type="button" className={`btn btn-sm btn-icon ${showHistory ? 'active' : ''}`} onClick={() => { setShowHistory(!showHistory); setShowBookmarks(false); }} title="История">
            <History size={14} />
          </button>
        )}
        {!compact && settings?.showBookmarksButton !== false && (
          <button type="button" className={`btn btn-sm btn-icon ${showBookmarks ? 'active' : ''}`} onClick={() => { setShowBookmarks(!showBookmarks); setShowHistory(false); }} title="Закладки">
            <Star size={14} />
          </button>
        )}
        {!compact && settings?.showDownloadsButton !== false && downloads.length > 0 && (
          <button type="button" className={`btn btn-sm btn-icon ${showDownloads ? 'active' : ''}`} onClick={() => setShowDownloads(!showDownloads)} title="Загрузки">
            <Download size={14} />
          </button>
        )}
        <UserAvatar
          profile={profile}
          authorized={authorized}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onOpenAccount={onOpenSettings}
        />
        <button
          type="button"
          className="btn btn-sm btn-icon chrome-settings-btn"
          onClick={onOpenSettings}
          title="Настройки"
        >
          <Settings size={16} />
        </button>
        <button
          ref={menuAnchorRef}
          type="button"
          className="btn btn-sm btn-icon chrome-settings-btn"
          onClick={onMenuToggle}
          title="Меню"
        >
          <MoreVertical size={16} />
        </button>
      </div>
    </div>
  );
});

export default Omnibox;
