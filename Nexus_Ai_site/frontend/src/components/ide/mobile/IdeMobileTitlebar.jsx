import { Menu, Sparkles } from 'lucide-react';

export default function IdeMobileTitlebar({ onOpenNav, onOpenCommandPalette, onOpenAccount }) {
  return (
    <header className="md:hidden ide-titlebar flex items-center justify-between px-2 h-[44px] select-none shrink-0 relative z-50 text-[var(--ide-fg)] border-b border-[var(--ide-border)]">
      <div className="flex items-center gap-1 min-w-0">
        <button
          type="button"
          onClick={onOpenNav}
          className="p-2 rounded-lg hover:bg-[var(--ide-hover)] text-[var(--ide-muted)] min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Меню Nexus"
        >
          <Menu size={20} />
        </button>
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-1.5 px-2 min-h-[36px] rounded-lg hover:bg-[var(--ide-hover)]"
        >
          <span className="text-[10px] font-black text-teal-400">NX</span>
          <span className="text-sm font-medium truncate">IDE</span>
        </button>
      </div>
      <button
        type="button"
        onClick={onOpenAccount}
        className="p-2 rounded-lg hover:bg-[var(--ide-hover)] text-teal-400 min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Аккаунт"
      >
        <Sparkles size={18} />
      </button>
    </header>
  );
}
