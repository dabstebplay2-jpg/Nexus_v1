import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, X } from 'lucide-react';

export default function IdeMobileBottomSheet({ open, title, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[50] bg-black/40 md:hidden"
            aria-label="Закрыть панель"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.12}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 400) onClose();
            }}
            className="fixed inset-x-0 bottom-0 z-[51] md:hidden flex flex-col bg-[#1e1e1e] border-t border-[#3c3c3c] rounded-t-xl max-h-[60dvh] min-h-[40dvh]"
            style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-center py-2 shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-3 py-1 border-b border-[#3c3c3c] shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#cccccc]">{title}</span>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-[#3c3c3c] min-w-[44px] min-h-[44px] flex items-center justify-center text-[#858585]"
                aria-label="Свернуть"
              >
                <ChevronDown size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
