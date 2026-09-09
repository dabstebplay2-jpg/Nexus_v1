import { useEffect, useRef, useState } from 'react';
import { User } from 'lucide-react';

export default function UserAvatar({ profile, authorized, onSignIn, onSignOut, onOpenAccount }) {
  const [imgError, setImgError] = useState(false);
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const initial = (profile?.email || 'U')[0].toUpperCase();
  const avatarUrl = authorized && profile?.email && !imgError
    ? `https://unavatar.io/${encodeURIComponent(profile.email)}?fallback=false`
    : null;

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const handleClick = () => {
    if (!authorized) {
      onSignIn?.();
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <div className="user-avatar-wrap">
      <button
        ref={btnRef}
        type="button"
        className="user-avatar-btn"
        onClick={handleClick}
        title={authorized ? profile?.email || 'Аккаунт' : 'Войти через Google'}
      >
        {avatarUrl ? (
          <img
            className="user-avatar-img"
            src={avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : authorized ? (
          <span className="user-avatar-fallback">{initial}</span>
        ) : (
          <User size={16} />
        )}
      </button>
      {open && authorized && (
        <div className="user-avatar-menu" ref={menuRef}>
          <div className="user-avatar-menu-email">{profile?.email}</div>
          <button type="button" className="menu-item" onClick={() => { onOpenAccount?.(); setOpen(false); }}>
            Я и Nexus
          </button>
          <button type="button" className="menu-item" onClick={() => { onSignOut?.(); setOpen(false); }}>
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}
