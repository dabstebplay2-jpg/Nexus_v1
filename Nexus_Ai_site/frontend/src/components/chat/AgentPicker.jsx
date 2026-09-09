import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AgentPicker({ agents = [], value, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = agents.find((a) => a.id === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-xs rounded-lg border px-2.5 py-2 min-w-[120px] max-w-[160px] ${
          open
            ? 'border-violet-500/50 bg-[#1c1c24] text-white'
            : 'border-white/15 bg-[#1c1c24] text-zinc-100 hover:border-white/25'
        }`}
      >
        <span className="truncate font-medium">
          {current ? `${current.emoji} ${current.name}` : 'Агент'}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-zinc-400 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 top-full mt-1 z-[80] min-w-[200px] rounded-xl border border-white/15 bg-[#14141a] shadow-2xl py-1 max-h-56 overflow-y-auto custom-scrollbar"
          >
            {agents.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={a.locked}
                  onClick={() => {
                    if (!a.locked) {
                      onChange(a.id);
                      setOpen(false);
                    }
                  }}
                  className={`w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 ${
                    a.locked
                      ? 'text-zinc-600 cursor-not-allowed'
                      : a.id === value
                        ? 'bg-violet-500/20 text-white'
                        : 'text-zinc-200 hover:bg-white/10'
                  }`}
                >
                  <span>
                    {a.emoji} {a.name}
                    {a.locked ? ' 🔒' : ''}
                  </span>
                  {a.id === value && !a.locked && <Check size={14} className="ml-auto text-violet-400" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
