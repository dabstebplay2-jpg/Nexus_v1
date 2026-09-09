import { useEffect, useRef, useState } from 'react';

export default function BrowserMenu({
  open,
  onClose,
  anchorRef,
  profile,
  authorized,
  onSignIn,
  onSignOut,
  onNewTab,
  onNewWindow,
  onShowHistory,
  onShowDownloads,
  onShowBookmarks,
  onShowSettings,
  onClearData,
  onFind,
  onPrint,
  onDevTools,
  onFullscreen,
  onQuit,
  activeTab,
  onZoom,
}) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 72, left: 12 });

  useEffect(() => {
    if (!open || !anchorRef?.current) return;
    const updatePosition = () => {
      const rect = anchorRef.current.getBoundingClientRect();
      const menuWidth = 300;
      let left = rect.left;
      if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, rect.right - menuWidth);
      }
      setPosition({ top: rect.bottom + 4, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (menuRef.current?.contains(e.target) || anchorRef?.current?.contains(e.target)) return;
      onClose();
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const zoom = Math.round((activeTab?.zoom || 1) * 100);

  return (
    <div
      className="browser-menu"
      ref={menuRef}
      style={{ top: position.top, left: position.left, right: 'auto' }}
    >
      <div className="menu-section">
        <button type="button" className="menu-item" onClick={() => { onNewTab(); onClose(); }}>
          <span>Новая вкладка</span><kbd>Ctrl+T</kbd>
        </button>
        <button type="button" className="menu-item" onClick={() => { onNewWindow(); onClose(); }}>
          <span>Новое окно</span><kbd>Ctrl+N</kbd>
        </button>
        <button type="button" className="menu-item" onClick={() => { onNewTab(true); onClose(); }}>
          <span>Окно инкогнито</span><kbd>Ctrl+Shift+N</kbd>
        </button>
      </div>

      <div className="menu-profile">
        {authorized ? (
          <>
            <div className="menu-profile-info">
              <span className="menu-profile-avatar">{(profile?.email || 'U')[0].toUpperCase()}</span>
              <div>
                <div className="menu-profile-name">{profile?.name || profile?.email || 'Аккаунт Nexus'}</div>
                <div className="menu-profile-status">Вход выполнен</div>
              </div>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => { onSignOut(); onClose(); }}>Выйти</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => { onSignIn(); onClose(); }}>
            Войти в Nexus
          </button>
        )}
      </div>

      <div className="menu-section">
        <button type="button" className="menu-item" onClick={() => { onShowHistory(); onClose(); }}>
          <span>История</span><kbd>Ctrl+H</kbd>
        </button>
        <button type="button" className="menu-item" onClick={() => { onShowDownloads(); onClose(); }}>
          <span>Загрузки</span><kbd>Ctrl+J</kbd>
        </button>
        <button type="button" className="menu-item" onClick={() => { onShowBookmarks(); onClose(); }}>
          <span>Закладки</span>
        </button>
        <button type="button" className="menu-item" onClick={() => { onClearData(); onClose(); }}>
          <span>Удалить данные браузера…</span>
        </button>
      </div>

      <div className="menu-section menu-zoom">
        <span className="menu-zoom-label">Масштаб</span>
        <div className="menu-zoom-controls">
          <button type="button" className="btn btn-sm" onClick={() => onZoom('out')}>−</button>
          <span>{zoom}%</span>
          <button type="button" className="btn btn-sm" onClick={() => onZoom('in')}>+</button>
          <button type="button" className="btn btn-sm" onClick={onFullscreen} title="F11">⛶</button>
        </div>
      </div>

      <div className="menu-section">
        <button type="button" className="menu-item" onClick={() => { onPrint(); onClose(); }}>
          <span>Печать…</span><kbd>Ctrl+P</kbd>
        </button>
        <button type="button" className="menu-item" onClick={() => { onFind(); onClose(); }}>
          <span>Найти на странице</span><kbd>Ctrl+F</kbd>
        </button>
        <button type="button" className="menu-item" onClick={() => { onDevTools(); onClose(); }}>
          <span>Инструменты разработчика</span><kbd>F12</kbd>
        </button>
      </div>

      <div className="menu-section">
        <button type="button" className="menu-item" onClick={() => { onShowSettings(); onClose(); }}>
          <span>Настройки</span>
        </button>
        <button type="button" className="menu-item" onClick={() => { onQuit(); onClose(); }}>
          <span>Выход</span>
        </button>
      </div>
    </div>
  );
}
