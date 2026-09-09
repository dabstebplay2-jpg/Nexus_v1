import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '../lib/adminApi';
import { useToast } from '../context/ToastContext';
import UserDrawer from '../components/UserDrawer';

const TIERS = ['', 'FREE', 'HOBBY', 'STANDARD', 'PRO', 'ULTRA'];

export default function UsersPage({ openUserId, onOpenUser }) {
  const { push } = useToast();
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('');
  const [shadowOnly, setShadowOnly] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawerId, setDrawerId] = useState(openUserId || null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (openUserId) setDrawerId(openUserId);
  }, [openUserId]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (q.trim()) params.set('q', q.trim());
      if (tier) params.set('tier', tier);
      if (shadowOnly) params.set('shadow_only', 'true');
      const data = await adminFetch(`/users?${params}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q, tier, shadowOnly]);

  const selectedCount = selected.size;
  const allOnPageSelected = items.length > 0 && items.every((u) => selected.has(u.id));
  const shadowOnPage = useMemo(() => items.filter((u) => u.is_tg_shadow), [items]);

  const toggleOne = (id, e) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    if (allOnPageSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.map((u) => u.id)));
  };

  const selectShadowOnPage = () => {
    setSelected(new Set(shadowOnPage.map((u) => u.id)));
  };

  const bulkDelete = async () => {
    if (!selectedCount) return;
    const ids = [...selected];
    const msg =
      `Удалить ${ids.length} аккаунт(ов) безвозвратно?\n\n` +
      'Будут удалены чаты, транзакции и привязки. Это действие нельзя отменить.';
    if (!window.confirm(msg)) return;
    setBulkBusy(true);
    try {
      const data = await adminFetch('/users/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ user_ids: ids }),
      });
      const ok = (data.deleted || []).length;
      const bad = (data.failed || []).length;
      if (ok) push(`Удалено аккаунтов: ${ok}`);
      if (bad) push(`Не удалось удалить: ${bad}`, 'err');
      await load();
    } catch (e) {
      push(e.message || 'Ошибка массового удаления', 'err');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Пользователи</h1>
      <div className="toolbar">
        <input
          placeholder="Email или @telegram"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          {TIERS.map((t) => (
            <option key={t || 'all'} value={t}>
              {t || 'Все тарифы'}
            </option>
          ))}
        </select>
        <label className="bulk-check-label">
          <input
            type="checkbox"
            checked={shadowOnly}
            onChange={(e) => setShadowOnly(e.target.checked)}
          />
          Только TG-shadow
        </label>
        <span className="muted">
          Показано: {items.length} / {total}
        </span>
      </div>

      {selectedCount > 0 ? (
        <div className="bulk-bar">
          <span>Выбрано: {selectedCount}</span>
          <button type="button" className="btn btn-sm" onClick={selectShadowOnPage} disabled={!shadowOnPage.length}>
            Выбрать shadow на странице ({shadowOnPage.length})
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setSelected(new Set())}>
            Снять выбор
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={bulkBusy} onClick={bulkDelete}>
            {bulkBusy ? 'Удаление…' : `Удалить выбранных (${selectedCount})`}
          </button>
        </div>
      ) : null}

      {loading ? <p className="muted">Загрузка…</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={toggleAllOnPage}
                aria-label="Выбрать всех на странице"
              />
            </th>
            <th>ID</th>
            <th>Email</th>
            <th>TG</th>
            <th>Тариф</th>
            <th>Polza</th>
            <th>OpenRouter</th>
            <th>Квота</th>
            <th>Баланс</th>
            <th>Создан</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr
              key={u.id}
              className={`clickable ${selected.has(u.id) ? 'row-selected' : ''}`}
              onClick={() => {
                setDrawerId(u.id);
                onOpenUser?.(u.id);
              }}
            >
              <td onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={(e) => toggleOne(u.id, e)}
                  aria-label={`Выбрать ${u.email}`}
                />
              </td>
              <td>{u.id}</td>
              <td>
                {u.email}
                {u.is_tg_shadow ? <span className="badge badge-warn" style={{ marginLeft: 6 }}>shadow</span> : null}
              </td>
              <td>{u.telegram_username ? `@${u.telegram_username}` : '—'}</td>
              <td>
                <span className={`badge ${u.subscription_tier === 'FREE' ? 'badge-free' : 'badge-paid'}`}>
                  {u.subscription_tier}
                </span>
              </td>
              <td>
                {u.has_polza_key ? (
                  <span className={`badge ${u.polza_ready ? 'badge-paid' : ''}`} title={u.polza_key_preview || ''}>
                    {u.polza_ready ? 'активен' : 'есть'}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {u.openrouter_ready ? (
                  <span className="badge badge-paid" title={u.openrouter_key_hash_preview || ''}>
                    активен
                  </span>
                ) : u.has_openrouter_key ? (
                  <span className="badge" title={u.openrouter_key_hash_preview || ''}>
                    есть
                  </span>
                ) : u.openrouter_uses_shared_key ? (
                  <span className="badge badge-free">общий</span>
                ) : (
                  '—'
                )}
              </td>
              <td className="muted" style={{ fontSize: '0.8rem' }}>
                {u.quota_enabled
                  ? `${Number(u.monthly_spent_usd || 0).toFixed(1)}/${Number(u.monthly_cap_usd || 0).toFixed(0)}`
                  : '—'}
              </td>
              <td>${Number(u.balance_usd || 0).toFixed(2)}</td>
              <td>{(u.created_at || '').slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > items.length ? (
        <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
          Показаны первые {items.length} из {total}. Сузьте фильтр (например «Только TG-shadow») или удаляйте партиями.
        </p>
      ) : null}
      {drawerId ? (
        <UserDrawer userId={drawerId} onClose={() => setDrawerId(null)} onUpdated={load} />
      ) : null}
    </>
  );
}
