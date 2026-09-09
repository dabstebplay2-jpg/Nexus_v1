import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plug, Github, Mail, Triangle, MessageCircle } from 'lucide-react';
import { fetchConnectorsSummary } from './connectorsApi';

const LABELS = {
  google_workspace: 'Gmail',
  github: 'GitHub',
  vercel: 'Vercel',
  discord: 'Discord',
};

const ICONS = {
  github: Github,
  google_workspace: Mail,
  vercel: Triangle,
  discord: MessageCircle,
};

export default function ConnectorChips({ authorized, onOpenSettings }) {
  const [connected, setConnected] = useState([]);

  useEffect(() => {
    if (!authorized) {
      setConnected([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchConnectorsSummary();
        if (!cancelled) {
          setConnected((data.connected || []).filter((c) => c.enabled_for_chat));
        }
      } catch {
        if (!cancelled) setConnected([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  if (!connected.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
      <span className="text-[10px] uppercase tracking-wide text-[var(--nx-muted)] flex items-center gap-1">
        <Plug size={12} />
        Коннекторы
      </span>
      {connected.map((c, i) => {
        const Icon = ICONS[c.id];
        return (
          <motion.span
            key={c.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.2 }}
            className="nx-connector-chip"
            title={c.label}
          >
            {Icon ? <Icon size={12} className="opacity-80" /> : null}
            {LABELS[c.id] || c.label || c.id}
          </motion.span>
        );
      })}
      <button
        type="button"
        onClick={onOpenSettings}
        className="text-[11px] text-[var(--nx-muted)] hover:text-[var(--nx-accent)] transition-colors"
      >
        Настроить
      </button>
    </div>
  );
}
