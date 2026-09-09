import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Puzzle, LogIn, Menu, X, Download } from 'lucide-react';
import { BROWSER_SETUP_URL, BROWSER_VERSION } from '../lib/browserDownload';
import { useAuth } from '../context/AuthContext';
import BrandLogo from './brand/BrandLogo';
import DiscordInviteLink from './DiscordInviteLink';

export default function SiteNav() {
  const { authStatus } = useAuth();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  const linkClass = (path) =>
    `block py-2.5 text-sm font-medium transition-colors ${
      loc.pathname === path ? 'text-cyan-400' : 'text-zinc-400 hover:text-white'
    }`;

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 border-b border-white/5 bg-[#07070a]/80 backdrop-blur-xl"
      style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
    >
      <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 group min-w-0">
          <BrandLogo
            variant="full"
            className="h-10 sm:h-11 max-w-[min(280px,72vw)] shrink min-w-0"
            imgClassName="h-10 sm:h-11 w-auto max-w-none object-contain object-left"
            fallback="text"
            fallbackText="NEXUS"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <a href="/#features" className="text-sm text-zinc-400 hover:text-white">
            Возможности
          </a>
          <DiscordInviteLink className="text-sm text-indigo-300/90 hover:text-indigo-200" />
          <a
            href={BROWSER_SETUP_URL}
            download
            className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/35 bg-violet-500/10 px-3 py-1.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/20 transition-colors"
            title={`Nexus Browser v${BROWSER_VERSION}`}
          >
            <Download size={14} />
            Browser
          </a>
          <Link to="/ide/lite" className={linkClass('/ide/lite')}>
            IDE Web
          </Link>
          <Link to="/pricing" className={linkClass('/pricing')}>
            Тарифы
          </Link>
          <Link to="/updates" className={linkClass('/updates')}>
            Изменения
          </Link>
          <Link to="/requisites" className={linkClass('/requisites')}>
            Реквизиты
          </Link>
          {authStatus.authorized ? (
            <>
              <Link to="/?settings=account" className={linkClass('/profile')}>
                Настройки
              </Link>
              <Link
                to="/browser"
                className="flex items-center gap-1.5 rounded-full bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-300 border border-violet-500/30 hover:bg-violet-500/20"
              >
                Скачать Browser
              </Link>
              <Link
                to="/ide"
                className="flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20"
              >
                <Puzzle size={16} /> Расширение для IDE
              </Link>
            </>
          ) : (
            <Link
              to="/?panel=auth"
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              <LogIn size={16} /> Войти
            </Link>
          )}
        </nav>

        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="md:hidden p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
          aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden border-t border-white/5 overflow-hidden"
          >
            <div className="px-4 py-4 flex flex-col gap-1">
              <a href="/#features" className={linkClass('/')} onClick={() => setMobileOpen(false)}>
                Возможности
              </a>
              <DiscordInviteLink
                className={linkClass('/')}
                onClick={() => setMobileOpen(false)}
              />
              <a
                href={BROWSER_SETUP_URL}
                download
                className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-violet-500/15 py-3 text-sm font-semibold text-violet-200 border border-violet-500/30"
                onClick={() => setMobileOpen(false)}
              >
                <Download size={18} /> Скачать Browser
              </a>
              <Link to="/ide/lite" className={linkClass('/ide/lite')} onClick={() => setMobileOpen(false)}>
                IDE Web
              </Link>
              <Link to="/pricing" className={linkClass('/pricing')} onClick={() => setMobileOpen(false)}>
                Тарифы
              </Link>
              <Link to="/updates" className={linkClass('/updates')} onClick={() => setMobileOpen(false)}>
                Изменения
              </Link>
              <Link to="/requisites" className={linkClass('/requisites')} onClick={() => setMobileOpen(false)}>
                Реквизиты
              </Link>
              {authStatus.authorized ? (
                <>
                  <Link to="/?settings=account" className={linkClass('/profile')} onClick={() => setMobileOpen(false)}>
                    Настройки
                  </Link>
                  <Link
                    to="/browser"
                    className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-violet-500/15 py-3 text-sm font-semibold text-violet-300 border border-violet-500/30"
                    onClick={() => setMobileOpen(false)}
                  >
                    Скачать Browser
                  </Link>
                  <Link
                    to="/ide"
                    className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-cyan-500/15 py-3 text-sm font-semibold text-cyan-300 border border-cyan-500/30"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Puzzle size={18} /> Расширение для IDE
                  </Link>
                </>
              ) : (
                <Link
                  to="/?panel=auth"
                  className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-semibold text-white"
                  onClick={() => setMobileOpen(false)}
                >
                  <LogIn size={18} /> Войти
                </Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
