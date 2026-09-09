import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Code2, MoreHorizontal } from 'lucide-react';

export default function ChatHeaderOverflow({ tier, onUpgrade, topics = [], onPickTopic }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-lg hover:bg-[var(--nx-surface-hover)] min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--nx-muted)]"
        aria-label="Ещё"
      >
        <MoreHorizontal size={20} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 top-full mt-1 w-56 nx-glass rounded-xl py-1 shadow-xl z-[100]"
          >
            <Link
              to="/ide/lite"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-[var(--nx-surface-hover)]"
            >
              <Code2 size={16} className="text-teal-400" />
              IDE Web
            </Link>
            <div className="px-4 py-2 text-xs text-[var(--nx-muted)] border-y border-[var(--nx-border)]">
              {tier?.name} тариф
            </div>
            {onUpgrade && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onUpgrade();
                }}
                className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[var(--nx-surface-hover)]"
              >
                Улучшить тариф
              </button>
            )}
            {topics.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onPickTopic?.(t);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-3 text-sm text-[var(--nx-muted)] hover:bg-[var(--nx-surface-hover)]"
              >
                {t}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
