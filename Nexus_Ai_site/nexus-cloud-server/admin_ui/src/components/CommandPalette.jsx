import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi';

export default function CommandPalette({ open, onClose, onSelectUser }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ('');
      setItems([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setItems([]);
        return;
      }
      setLoading(true);
      try {
        const data = await adminFetch(`/users?q=${encodeURIComponent(q.trim())}&limit=12`);
        setItems(data.items || []);
        setActive(0);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, items.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && items[active]) {
        onSelectUser(items[active].id);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, onClose, onSelectUser]);

  if (!open) return null;

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <input
          placeholder="Поиск по email или @telegram…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="cmd-results">
          {loading ? <p className="muted" style={{ padding: '0.75rem 1rem' }}>Поиск…</p> : null}
          {!loading && !items.length && q ? (
            <p className="muted" style={{ padding: '0.75rem 1rem' }}>Ничего не найдено</p>
          ) : null}
          {items.map((u, i) => (
            <div
              key={u.id}
              className={`cmd-item ${i === active ? 'active' : ''}`}
              onClick={() => {
                onSelectUser(u.id);
                onClose();
              }}
            >
              <strong>{u.email}</strong>
              <span className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                {u.subscription_tier}
                {u.telegram_username ? ` · @${u.telegram_username}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
