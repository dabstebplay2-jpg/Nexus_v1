import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Boxes,
  Puzzle,
  LayoutGrid,
  Plus,
  PanelLeftClose,
  ArrowUpCircle,
  Clock,
  Menu,
  X,
  LifeBuoy,
  Radio,
  Code2,
  Globe,
} from 'lucide-react';
import ProfileMenu from './ProfileMenu';
import BrandLogo from '../brand/BrandLogo';
import DiscordInviteLink from '../DiscordInviteLink';
import AmbientBackground from '../AmbientBackground';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useVisualViewportPadding } from '../../hooks/useVisualViewportPadding';

const IDE_WEB_NAV_BADGE_KEY = 'nexus_seen_ide_web_nav';

const NAV_GROUPS = [
  {
    title: 'Работа',
    items: [
      { path: '/', label: 'Чат', icon: MessageSquare, match: (p) => p === '/' },
      {
        path: '/ide/lite',
        label: 'IDE Web',
        title: 'Редактор и Agent в браузере',
        icon: Code2,
        match: (p) => p === '/ide/lite',
        badge: 'new',
      },
      { path: '/spaces', label: 'Пространства', icon: Boxes, match: (p) => p === '/spaces' },
    ],
  },
  {
    title: 'Файлы',
    items: [{ path: '/artifacts', label: 'Артефакты', icon: LayoutGrid, match: (p) => p === '/artifacts' }],
  },
  {
    title: 'Приложения',
    items: [
      {
        path: '/browser',
        label: 'Скачать Browser',
        title: 'Nexus Browser для Windows',
        icon: Globe,
        match: (p) => p === '/browser',
        badge: 'new',
      },
      {
        path: '/ide',
        label: 'Скачать IDE',
        title: 'Desktop и расширение VSIX',
        icon: Puzzle,
        match: (p) => p === '/ide',
      },
    ],
  },
  {
    title: 'Сервис',
    items: [
      {
        path: '/updates',
        label: 'Изменения',
        title: 'Журнал релизов и что нового',
        icon: Radio,
        match: (p) => p === '/updates',
      },
      { action: 'support', label: 'Поддержка', icon: LifeBuoy },
    ],
  },
];

const MOBILE_TABS = [
  { path: '/', label: 'Чат', icon: MessageSquare, match: (p) => p === '/' },
  { path: '/ide/lite', label: 'IDE', icon: Code2, match: (p) => p === '/ide/lite' },
  { path: '/pricing', label: 'Тарифы', icon: ArrowUpCircle, match: (p) => p === '/pricing' },
];

function SidebarContent({
  expanded,
  isMobile,
  pathname,
  collapsed,
  hideHistory,
  historyItems,
  activeHistoryId,
  onSelectHistory,
  onDeleteHistory,
  onNewChat,
  onOpenPricing,
  onOpenSupport,
  setCollapsed,
  setMobileOpen,
}) {
  const handleLogoClick = (e) => {
    setMobileOpen(false);
    if (!isMobile && collapsed) {
      e.preventDefault();
      setCollapsed(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between min-h-[3.5rem] h-14 px-3 border-b border-[var(--nx-border)]">
        <Link
          to="/"
          className={`flex items-center shrink-0 py-1 rounded-lg ${
            !isMobile && collapsed ? 'hover:bg-[var(--nx-surface-hover)]' : ''
          }`}
          title={!isMobile && collapsed ? 'Развернуть панель' : 'Nexus'}
          onClick={handleLogoClick}
        >
          <BrandLogo variant="icon" className="h-9 w-9" imgClassName="h-9 w-9 object-contain" alt="Nexus" />
        </Link>
        {expanded && (
          <div className="flex items-center gap-1">
            {!isMobile && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="p-1.5 rounded-lg hover:bg-[var(--nx-surface-hover)] text-[var(--nx-muted)]"
                title="Свернуть"
                aria-label="Свернуть боковую панель"
              >
                <PanelLeftClose size={18} />
              </button>
            )}
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--nx-surface-hover)] text-[var(--nx-muted)]"
                aria-label="Закрыть меню"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-2">
        <button
          type="button"
          onClick={onNewChat}
          aria-label="Новый чат"
          className={`w-full flex items-center justify-center gap-2.5 py-3 min-h-[52px] rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] hover:bg-[var(--nx-surface-hover)] text-base font-medium transition-colors ${
            expanded ? 'px-4' : 'px-0'
          }`}
        >
          <Plus size={22} />
          {expanded && <span>Новый</span>}
        </button>
      </div>

      <nav className="px-2 space-y-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            {expanded && (
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--nx-muted)]">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const { label, icon: Icon, title: navTitle } = item;
                if (item.action === 'support') {
                  return (
                    <button
                      key="support"
                      type="button"
                      title={label}
                      aria-label={label}
                      onClick={() => {
                        setMobileOpen(false);
                        onOpenSupport?.();
                      }}
                      className="relative w-full flex items-center gap-3 px-3 py-3 min-h-[52px] rounded-2xl text-base transition-colors text-[var(--nx-muted)] hover:bg-[var(--nx-surface-hover)] hover:text-[var(--nx-text)]"
                    >
                      <Icon size={22} className="shrink-0 text-teal-500/90" />
                      {expanded && <span>{label}</span>}
                    </button>
                  );
                }
                const active = item.match(pathname);
                const showNewBadge =
                  item.badge === 'new' &&
                  expanded &&
                  typeof localStorage !== 'undefined' &&
                  !localStorage.getItem(IDE_WEB_NAV_BADGE_KEY);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={navTitle || label}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      if (item.badge === 'new') {
                        try {
                          localStorage.setItem(IDE_WEB_NAV_BADGE_KEY, '1');
                        } catch {
                          /* ignore */
                        }
                      }
                      setMobileOpen(false);
                    }}
                    className={`relative flex items-center gap-3 px-3 py-3 min-h-[52px] rounded-2xl text-base transition-colors ${
                      active
                        ? 'bg-[var(--nx-surface-hover)] text-[var(--nx-text)] font-semibold shadow-[inset_2px_0_0_var(--nx-accent)]'
                        : 'text-[var(--nx-muted)] hover:bg-[var(--nx-surface-hover)] hover:text-[var(--nx-text)]'
                    }`}
                  >
                    <Icon size={22} className="shrink-0" />
                    {expanded && (
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{label}</span>
                        {showNewBadge && (
                          <span className="shrink-0 rounded-md bg-teal-500/20 border border-teal-500/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-300">
                            New
                          </span>
                        )}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!hideHistory && expanded && historyItems.length > 0 && (
        <div className="flex-1 min-h-0 flex flex-col mt-3 px-2">
          <p className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--nx-muted)]">
            <Clock size={14} />
            История
          </p>
          <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1">
            {historyItems.map((item) => (
              <div
                key={item.id}
                className={`group flex items-center rounded-lg mb-0.5 ${
                  item.id === activeHistoryId
                    ? 'bg-[var(--nx-surface-hover)]'
                    : 'hover:bg-[var(--nx-surface-hover)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectHistory?.(item.id);
                    setMobileOpen(false);
                  }}
                  className="flex-1 text-left px-3 py-2.5 min-h-[48px] text-[15px] text-[var(--nx-muted)] group-hover:text-[var(--nx-text)] truncate"
                >
                  {item.title}
                </button>
                {onDeleteHistory && (
                  <button
                    type="button"
                    onClick={() => onDeleteHistory(item.id)}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 px-2 text-lg text-red-400/80 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Удалить чат"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!hideHistory && !expanded && !isMobile && <div className="flex-1" />}

      <div
        className={`mt-auto border-t border-[var(--nx-border)] space-y-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${
          expanded ? 'p-2' : 'px-1 py-2'
        }`}
      >
        <button
          type="button"
          aria-label="Обновить тариф"
          onClick={() => {
            onOpenPricing?.();
            setMobileOpen(false);
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-3 min-h-[52px] rounded-2xl text-base text-[var(--nx-muted)] hover:bg-[var(--nx-surface-hover)] hover:text-[var(--nx-text)] ${
            expanded ? '' : 'justify-center'
          }`}
        >
          <ArrowUpCircle size={22} />
          {expanded && <span>Обновить тариф</span>}
        </button>
        <DiscordInviteLink
          showIcon
          onClick={() => setMobileOpen(false)}
          className={`w-full flex items-center gap-2.5 px-3 py-3 min-h-[52px] rounded-2xl text-base text-[var(--nx-muted)] hover:bg-[var(--nx-surface-hover)] hover:text-indigo-300 ${
            expanded ? '' : 'justify-center'
          }`}
        >
          {expanded ? 'Discord' : null}
        </DiscordInviteLink>
        <ProfileMenu expanded={expanded} onOpenPricing={onOpenPricing} />
      </div>
    </>
  );
}

export default function AppShell({
  children,
  onNewChat,
  historyItems = [],
  onSelectHistory,
  onDeleteHistory,
  activeHistoryId,
  headerLeft = null,
  headerRight = null,
  onOpenPricing,
  hideHistory = false,
  ambientFocus = 'center',
  compactChrome = false,
  showMobileTabBar = true,
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const pageTitle = usePageTitle();
  const keyboardPad = useVisualViewportPadding();
  const isKeyboardOpen = keyboardPad > 50;
  const showMobileTabBarWithKeyboard = showMobileTabBar && !isKeyboardOpen;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const shellRef = useRef(null);
  const hideMobileHeader = compactChrome;
  const showDesktopHeader = !hideMobileHeader && Boolean(headerLeft || headerRight);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const openDrawer = () => setMobileOpen(true);
    window.addEventListener('nexus-open-drawer', openDrawer);
    return () => window.removeEventListener('nexus-open-drawer', openDrawer);
  }, []);

  const handleNew = () => {
    if (onNewChat) onNewChat();
    else if (pathname !== '/') navigate('/');
    setMobileOpen(false);
  };

  const handleOpenSupport = () => {
    if (pathname === '/') {
      window.dispatchEvent(new CustomEvent('nexus-open-support'));
    } else {
      navigate('/?support=1');
    }
    setMobileOpen(false);
  };

  const sidebarProps = {
    pathname,
    collapsed,
    hideHistory,
    historyItems,
    activeHistoryId,
    onSelectHistory,
    onDeleteHistory,
    onNewChat: handleNew,
    onOpenPricing,
    onOpenSupport: handleOpenSupport,
    setCollapsed,
    setMobileOpen,
  };

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <div
      ref={shellRef}
      className="nx-shell relative h-[100dvh] overflow-x-hidden max-md:flex max-md:flex-col md:grid md:grid-cols-[auto_1fr]"
    >
      <AmbientBackground focus={ambientFocus} />

      {/* Desktop: в потоке flex, без transform / framer width */}
      <aside
        data-nx-sidebar="desktop"
        className={`hidden md:flex nx-sidebar shrink-0 flex-col border-r h-full z-30 overflow-hidden transition-[width] duration-300 ease-out ${
          collapsed ? 'w-[var(--nx-sidebar-collapsed-w)]' : 'w-[var(--nx-sidebar-w)]'
        }`}
      >
        <SidebarContent expanded={!collapsed} isMobile={false} {...sidebarProps} />
      </aside>

      {/* Mobile: overlay drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/55 md:hidden"
              aria-label="Закрыть меню"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              data-nx-sidebar="mobile"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="md:hidden fixed inset-y-0 left-0 z-50 w-[var(--nx-sidebar-w)] nx-sidebar flex flex-col border-r h-full"
            >
              <SidebarContent expanded isMobile {...sidebarProps} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div
        data-nx-main
        className="flex flex-col min-w-0 min-h-0 max-md:flex-1 relative z-10 w-full md:h-full md:overflow-hidden"
      >
        {showDesktopHeader && (
          <header
            className="h-[var(--nx-header-h)] shrink-0 flex items-center justify-between gap-3 px-4 sm:px-5 border-b border-[var(--nx-border)] bg-[color-mix(in_srgb,var(--nx-sidebar)_90%,transparent)] backdrop-blur-xl z-20 max-md:hidden md:flex"
            style={{ paddingTop: 'var(--nx-safe-top)' }}
          >
            <div className="flex items-center gap-2 min-w-0">{headerLeft}</div>
            <div className="flex items-center gap-2 shrink-0">{headerRight}</div>
          </header>
        )}
        {!hideMobileHeader && (
          <header
            className="md:hidden h-[var(--nx-header-h)] shrink-0 flex items-center justify-between gap-2 px-3 border-b border-[var(--nx-border)] bg-[color-mix(in_srgb,var(--nx-sidebar)_90%,transparent)] backdrop-blur-xl z-20 overflow-x-clip"
            style={{ paddingTop: 'var(--nx-safe-top)' }}
          >
            <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-clip">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="p-2 rounded-lg hover:bg-[var(--nx-surface-hover)] text-[var(--nx-muted)] min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                aria-label="Открыть меню"
              >
                <Menu size={20} />
              </button>
              <Link to="/" className="shrink-0" aria-label="Nexus">
                <BrandLogo variant="icon" className="h-8 w-8" imgClassName="h-8 w-8 object-contain" alt="" />
              </Link>
              {!headerLeft && (
                <span className="text-sm font-medium text-[var(--nx-text)] truncate ml-1">{pageTitle}</span>
              )}
              <div className="shrink-0 overflow-x-clip">{headerLeft}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">{headerRight}</div>
          </header>
        )}
        <div
          className={`nx-page-host flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden ${
            showMobileTabBarWithKeyboard && !compactChrome ? 'max-md:pb-[calc(var(--nx-dock-h)+var(--nx-safe-bottom))]' : ''
          }`}
        >
          {children}
        </div>
        {showMobileTabBarWithKeyboard && !compactChrome && (
          <nav
            className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch justify-around border-t border-[var(--nx-border)] bg-[color-mix(in_srgb,var(--nx-sidebar)_95%,transparent)] backdrop-blur-xl"
            style={{ paddingBottom: 'var(--nx-safe-bottom)', height: 'calc(var(--nx-dock-h) + var(--nx-safe-bottom))' }}
          >
            {MOBILE_TABS.map(({ path, label, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={path}
                  to={path}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] min-h-[var(--nx-touch-min)] ${
                    active ? 'text-teal-400' : 'text-[var(--nx-muted)]'
                  }`}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-[var(--nx-muted)] min-h-[var(--nx-touch-min)]"
            >
              <Menu size={20} />
              <span>Меню</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
