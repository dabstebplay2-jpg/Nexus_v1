import { useState } from 'react';
import { Sparkles, Plus, Pencil, Trash2 } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import SuggestDropdown from '../components/SuggestDropdown';
import { useOmniboxSuggestions } from '../hooks/useOmniboxSuggestions';

function newId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function NewTabPage({
  settings,
  searchEngines,
  onSearch,
  onNavigateShortcut,
  onUpdateShortcuts,
}) {
  const [query, setQuery] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const {
    suggestions,
    open: suggestOpen,
    setOpen: setSuggestOpen,
    selectedIndex,
    setSelectedIndex,
    handleFocus: handleSuggestFocus,
    handleBlur: handleSuggestBlur,
    handleKeyDown: handleSuggestKeyDown,
  } = useOmniboxSuggestions(query);
  const [editing, setEditing] = useState(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');

  const engine = searchEngines.find((e) => e.id === settings?.searchEngine);
  const shortcuts = settings?.ntpShortcuts || [];

  const submit = (e, forceAi = false) => {
    e?.preventDefault?.();
    if (!query.trim()) return;
    onSearch(query.trim(), forceAi || aiMode);
    setQuery('');
    setSuggestOpen(false);
  };

  const applySuggestion = (s) => {
    setSuggestOpen(false);
    const target = s.type === 'search' ? s.query : s.url;
    if (!target) return;
    onSearch(target, false);
    setQuery('');
  };

  const handleAiClick = () => {
    if (query.trim()) {
      submit({ preventDefault: () => {} }, true);
      return;
    }
    setAiMode(!aiMode);
  };

  const openAdd = () => {
    setEditing('new');
    setFormName('');
    setFormUrl('');
  };

  const openEdit = (s) => {
    setEditing(s.id);
    setFormName(s.name);
    setFormUrl(s.url);
  };

  const saveShortcut = () => {
    const name = formName.trim();
    let url = formUrl.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    let next;
    if (editing === 'new') {
      next = [...shortcuts, { id: newId(), name, url }];
    } else {
      next = shortcuts.map((s) => (s.id === editing ? { ...s, name, url } : s));
    }
    onUpdateShortcuts(next);
    setEditing(null);
  };

  const deleteShortcut = (id) => {
    onUpdateShortcuts(shortcuts.filter((s) => s.id !== id));
    if (editing === id) setEditing(null);
  };

  const faviconHost = (url) => {
    try {
      return new URL(url).hostname[0]?.toUpperCase() || '?';
    } catch {
      return '?';
    }
  };

  const wallpaperUrl = settings?.wallpaperPath
    ? (settings.wallpaperPath.startsWith('http')
        ? settings.wallpaperPath
        : `local-file://wallpaper/${encodeURIComponent(settings.wallpaperPath)}`)
    : '';

  return (
    <div className="ntp">
      {settings?.wallpaperType === 'image' && wallpaperUrl && (
        <div className="ntp-wallpaper" style={{
          backgroundImage: `url(${wallpaperUrl})`,
          filter: `blur(${settings.wallpaperBlur || 0}px) brightness(${settings.wallpaperBrightness ?? 100}%) contrast(${settings.wallpaperContrast ?? 100}%)`
        }} />
      )}
      {settings?.wallpaperType === 'video' && wallpaperUrl && (
        <div className="ntp-wallpaper">
          <video
            src={wallpaperUrl}
            autoPlay
            loop
            muted
            playsInline
            style={{
              filter: `blur(${settings.wallpaperBlur || 0}px) brightness(${settings.wallpaperBrightness ?? 100}%) contrast(${settings.wallpaperContrast ?? 100}%)`
            }}
          />
        </div>
      )}
      <div className="ntp-logo">
        <BrandLogo variant="full" imgClassName="ntp-logo__img" alt="Nexus" fallback="text" fallbackText="Nexus" />
      </div>
      <div className="ntp-search-wrap">
        <form className="ntp-search" onSubmit={submit}>
          {engine && <span className="ntp-engine">{engine.icon}</span>}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
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
            placeholder="Введите поисковый запрос или URL"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className={`ntp-ai-btn ${aiMode ? 'active' : ''}`}
            onClick={handleAiClick}
            title={query.trim() ? 'Искать с ИИ' : 'Включить режим ИИ'}
          >
            <Sparkles size={14} /> ИИ
          </button>
        </form>
        <SuggestDropdown
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          onSelect={applySuggestion}
          onHover={setSelectedIndex}
          visible={suggestOpen}
          className="suggest-dropdown--ntp"
        />
      </div>

      <div className="ntp-shortcuts">
        {shortcuts.map((s) => (
          <div key={s.id} className="ntp-shortcut-wrap">
            <button
              type="button"
              className="ntp-shortcut"
              onClick={() => onNavigateShortcut(s.url)}
              title={s.url}
            >
              <span className="ntp-shortcut-icon">{faviconHost(s.url)}</span>
              <span className="ntp-shortcut-label">{s.name}</span>
            </button>
            <div className="ntp-shortcut-actions">
              <button type="button" className="btn btn-sm btn-icon" onClick={() => openEdit(s)} title="Изменить">
                <Pencil size={12} />
              </button>
              <button type="button" className="btn btn-sm btn-icon" onClick={() => deleteShortcut(s.id)} title="Удалить">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="ntp-shortcut ntp-shortcut-add" onClick={openAdd}>
          <span className="ntp-shortcut-icon"><Plus size={20} /></span>
          <span className="ntp-shortcut-label">Добавить</span>
        </button>
      </div>

      {editing && (
        <div className="ntp-modal-backdrop" onClick={() => setEditing(null)}>
          <div className="ntp-modal" onClick={(e) => e.stopPropagation()}>
            <h4>{editing === 'new' ? 'Новый ярлык' : 'Изменить ярлык'}</h4>
            <label>
              Название
              <input className="settings-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Например: YouTube" />
            </label>
            <label>
              URL
              <input className="settings-input" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://..." />
            </label>
            <div className="ntp-modal-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>Отмена</button>
              <button type="button" className="btn btn-primary" onClick={saveShortcut}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
