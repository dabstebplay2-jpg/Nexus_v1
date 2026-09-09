import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquare, Code2, Puzzle, Globe } from 'lucide-react';

const MODES = [
  { path: '/', label: 'Чат', icon: MessageSquare, match: (p) => p === '/' || p.startsWith('/chat') },
  { path: '/ide/lite', label: 'IDE Web', icon: Code2, match: (p) => p === '/ide/lite' },
  { path: '/browser', label: 'Browser', icon: Globe, match: (p) => p === '/browser' },
  { path: '/ide', label: 'Скачать IDE', icon: Puzzle, match: (p) => p === '/ide' },
];

export default function AppModeNav({ compact = false }) {
  const { pathname } = useLocation();

  return (
    <nav
      className={`flex items-center gap-1 rounded-xl bg-white/[0.04] border border-white/[0.08] p-1 ${
        compact ? 'scale-90 origin-right' : ''
      }`}
    >
      {MODES.map(({ path, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={path}
            to={path}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/25 to-violet-500/20 border border-cyan-500/30"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon size={14} className={`relative z-10 ${active ? 'text-cyan-300' : 'text-zinc-500'}`} />
            <span className={`relative z-10 ${active ? 'text-white' : 'text-zinc-400'}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
