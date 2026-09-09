import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Brain, ArrowUpCircle, HelpCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ProfileMenu({ onOpenPricing, expanded = true }) {
  const { authStatus, logout, openAuthModal, openSettingsModal } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const profile = authStatus.profile;
  const email = profile?.email || 'guest@nexus.local';
  const name = email.split('@')[0] || 'Пользователь';
  useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate('/');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center rounded-2xl hover:bg-[var(--nx-surface-hover)] transition-colors ${
          expanded
            ? 'gap-3 px-2 py-2.5 text-left'
            : 'justify-center px-0 py-2.5'
        }`}
      >
        <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-teal-500 to-emerald-700 flex items-center justify-center text-sm font-bold text-white uppercase">
          {name.slice(0, 2)}
        </div>
        {expanded && (
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium truncate text-[var(--nx-text)]">{name}</p>
            <p className="text-sm text-[var(--nx-muted)] truncate">{email}</p>
          </div>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-[min(280px,calc(100vw-80px))] lg:w-[300px] z-[90] nx-glass rounded-2xl shadow-2xl overflow-visible nx-menu-pop"
          >
            <div className="px-4 py-3 border-b border-[var(--nx-border)]">
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-xs text-[var(--nx-muted)] truncate">{email}</p>
            </div>

            <ul className="py-1 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (authStatus.authorized) openSettingsModal('general');
                    else openAuthModal();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--nx-surface-hover)] text-left"
                >
                  <Settings size={18} className="text-[var(--nx-muted)]" />
                  Настройки
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openSettingsModal('memory');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--nx-surface-hover)] text-left"
                >
                  <Brain size={18} className="text-[var(--nx-muted)]" />
                  Память
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (authStatus.authorized) openSettingsModal('subscription');
                    else onOpenPricing?.();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--nx-surface-hover)]"
                >
                  <ArrowUpCircle size={18} className="text-[var(--nx-muted)]" />
                  Подписка
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (authStatus.authorized) openSettingsModal('help');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--nx-surface-hover)]"
                >
                  <HelpCircle size={18} className="text-[var(--nx-muted)]" />
                  Справка
                </button>
              </li>
            </ul>

            {authStatus.authorized ? (
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 border-t border-[var(--nx-border)] text-sm hover:bg-[var(--nx-surface-hover)]"
              >
                <LogOut size={18} />
                Выйти
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openAuthModal();
                }}
                className="w-full px-4 py-3 border-t border-[var(--nx-border)] text-sm text-teal-500 hover:bg-[var(--nx-surface-hover)]"
              >
                Войти в аккаунт
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
