import { FolderTree, Sparkles, Terminal, MoreHorizontal } from 'lucide-react';

const PRIMARY = [
  { id: 'explorer', tab: 'explorer', icon: FolderTree, label: 'Files' },
  { id: 'ai', tab: 'ai', icon: Sparkles, label: 'Agent' },
  { id: 'terminal', tab: null, icon: Terminal, label: 'Terminal' },
  { id: 'more', tab: null, icon: MoreHorizontal, label: 'More' },
];

export default function IdeMobileDock({
  activeTab,
  onSelectTab,
  onToggleTerminal,
  onOpenMore,
  terminalOpen,
}) {
  return (
    <nav
      className="md:hidden ide-mobile-dock flex items-center justify-around border-t border-[var(--ide-border)] bg-[var(--ide-activity)] shrink-0 py-1 px-1 nx-safe-pb"
      style={{ minHeight: 'var(--nx-dock-h)' }}
    >
      {PRIMARY.map(({ id, tab, icon: Icon, label }) => {
        const active =
          id === 'terminal' ? terminalOpen : id === 'more' ? false : activeTab === tab;
        const onClick = () => {
          if (id === 'terminal') onToggleTerminal?.();
          else if (id === 'more') onOpenMore?.();
          else onSelectTab?.(tab);
        };
        return (
          <button
            key={id}
            type="button"
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[var(--nx-touch-min)] min-h-[var(--nx-touch-min)] flex-1 rounded-xl text-[10px] ${
              active ? 'text-teal-400 bg-teal-500/10' : 'text-[var(--ide-muted)]'
            }`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
