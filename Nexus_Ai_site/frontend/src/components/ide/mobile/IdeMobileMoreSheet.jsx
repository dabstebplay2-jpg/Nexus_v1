import { AnimatePresence, motion } from 'framer-motion';
import {
  FolderTree,
  Search,
  GitBranch,
  Play,
  Puzzle,
  Globe,
  Database,
  Settings,
  User,
  X,
} from 'lucide-react';

const MORE_ITEMS = [
  { tab: 'search', icon: Search, label: 'Search' },
  { tab: 'git', icon: GitBranch, label: 'Git' },
  { tab: 'run', icon: Play, label: 'Run' },
  { tab: 'extensions', icon: Puzzle, label: 'Extensions' },
  { tab: 'api_client', icon: Globe, label: 'REST Client', optional: true },
  { tab: 'db', icon: Database, label: 'SQLite', optional: true },
  { tab: 'profile', icon: User, label: 'Account' },
  { tab: 'settings', icon: Settings, label: 'Settings' },
];

export default function IdeMobileMoreSheet({ open, onClose, onSelectTab, enabledViews }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] bg-black/55 md:hidden"
            aria-label="Закрыть"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed inset-x-0 bottom-0 z-[56] md:hidden rounded-t-2xl border-t border-[var(--ide-border)] bg-[var(--ide-sidebar)] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ide-border)]">
              <span className="text-sm font-semibold">Ещё</span>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-[var(--ide-hover)] min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 p-4 max-h-[50dvh] overflow-y-auto custom-scrollbar">
              {MORE_ITEMS.filter((item) => !item.optional || enabledViews?.has(item.tab)).map(
                ({ tab, icon: Icon, label }) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      onSelectTab(tab);
                      onClose();
                    }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[var(--ide-hover)] text-[var(--ide-muted)] min-h-[72px]"
                  >
                    <Icon size={22} />
                    <span className="text-[10px] text-center leading-tight">{label}</span>
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => {
                  onSelectTab('explorer');
                  onClose();
                }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[var(--ide-hover)] text-[var(--ide-muted)] min-h-[72px]"
              >
                <FolderTree size={22} />
                <span className="text-[10px]">Explorer</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
