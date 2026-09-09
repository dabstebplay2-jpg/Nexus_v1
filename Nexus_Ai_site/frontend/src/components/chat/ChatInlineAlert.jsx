import { motion } from 'framer-motion';

const VARIANT_CLASS = {
  info: 'nx-inline-alert--info',
  warning: 'nx-inline-alert--warning',
  error: 'nx-inline-alert--error',
};

export default function ChatInlineAlert({
  variant = 'info',
  icon: Icon,
  children,
  actions,
  onDismiss,
  progressPct,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`nx-inline-alert ${VARIANT_CLASS[variant] || VARIANT_CLASS.info}`}
      role="status"
    >
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {Icon && (
          <span className="nx-inline-alert__icon-wrap" aria-hidden>
            <Icon size={14} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
          {progressPct != null && progressPct > 0 && (
            <div
              className="nx-inline-alert__progress"
              role="progressbar"
              aria-valuenow={Math.round(progressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="nx-inline-alert__progress-fill"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          )}
        </div>
      </div>
      {(actions || onDismiss) && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-[var(--nx-muted)] hover:text-[var(--nx-text)] text-xs px-1"
            >
              Скрыть
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
