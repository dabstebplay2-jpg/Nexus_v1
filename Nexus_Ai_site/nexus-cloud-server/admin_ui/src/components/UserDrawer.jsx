import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { adminFetch } from '../lib/adminApi';
import { useToast } from '../context/ToastContext';

const TIERS = ['FREE', 'HOBBY', 'STANDARD', 'PRO', 'ULTRA'];

function fmtDate(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function polzaLabel(u) {
  if (!u?.has_polza_key) return 'нет';
  if (u.polza_ready) return 'активен';
  return 'есть, ждёт тариф/квоту';
}

function openrouterLabel(u) {
  if (u?.openrouter_ready) return 'активен (per-user)';
  if (u?.has_openrouter_key) return 'есть ключ';
  if (u?.openrouter_uses_shared_key) return 'общий ключ';
  if (u?.subscription_tier === 'FREE') return 'нет (выдастся при чате)';
  return '—';
}

export default function UserDrawer({ userId, onClose, onUpdated }) {
  const { push } = useToast();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [balance, setBalance] = useState('');
  const [password, setPassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`/users/${userId}`);
      setDetail(data);
      setEmail(data.user?.email || '');
      setBalance(String(data.user?.balance_usd ?? 0));
    } catch (e) {
      push(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) load();
  }, [userId]);

  const u = detail?.user;

  const grantTier = async (tier) => {
    setBusy(true);
    try {
      if (tier === 'FREE') {
        await adminFetch(`/users/${userId}/revoke-tier`, { method: 'POST' });
      } else {
        await adminFetch(`/users/${userId}/grant-tier`, {
          method: 'POST',
          body: JSON.stringify({ tier }),
        });
      }
      push(`Тариф → ${tier}`);
      await load();
      onUpdated?.();
    } catch (e) {
      push(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const saveUser = async (extra = {}) => {
    setBusy(true);
    try {
      const body = {
        email: email.trim() || undefined,
        balance_usd: balance !== '' ? Number(balance) : undefined,
        new_password: password.length >= 6 ? password : undefined,
        refresh_polza: extra.refreshPolza || false,
        refresh_openrouter: extra.refreshOpenrouter || false,
      };
      await adminFetch(`/users/${userId}`, { method: 'PUT', body: JSON.stringify(body) });
      push('Сохранено');
      setPassword('');
      await load();
      onUpdated?.();
    } catch (e) {
      push(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const unlinkTelegram = async () => {
    if (!window.confirm('Отвязать Telegram от этого аккаунта?')) return;
    setBusy(true);
    try {
      await adminFetch(`/users/${userId}/unlink-telegram`, { method: 'POST' });
      push('Telegram отвязан');
      await load();
      onUpdated?.();
    } catch (e) {
      push(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const unlinkGoogle = async () => {
    if (!window.confirm('Отвязать Google от этого аккаунта?')) return;
    setBusy(true);
    try {
      await adminFetch(`/users/${userId}/unlink-google`, { method: 'POST' });
      push('Google отвязан');
      await load();
      onUpdated?.();
    } catch (e) {
      push(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async () => {
    if (deleteConfirm !== u?.email) {
      push('Введите email для подтверждения удаления', 'err');
      return;
    }
    if (!window.confirm('Удалить аккаунт безвозвратно?')) return;
    setBusy(true);
    try {
      await adminFetch(`/users/${userId}`, { method: 'DELETE' });
      push('Пользователь удалён');
      onUpdated?.();
      onClose();
    } catch (e) {
      push(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  if (!userId) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <button type="button" className="btn btn-sm" onClick={onClose} style={{ float: 'right' }}>
          <X size={14} />
        </button>
        {loading || !u ? (
          <p className="muted">Загрузка…</p>
        ) : (
          <>
            <h2>{u.email}</h2>
            <p className="sub">
              ID {u.id} · {u.subscription_tier}
              {u.is_tg_shadow ? ' · TG-shadow' : ''}
            </p>

            <h3 style={{ fontSize: '0.9rem', marginTop: '0.75rem' }}>ИИ-ключи</h3>
            <div className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              <div>
                <strong>Polza:</strong> {polzaLabel(u)}
                {u.polza_key_preview ? ` · ${u.polza_key_preview}` : ''}
                {u.polza_key_id ? ` · id ${u.polza_key_id}` : ''}
              </div>
              <div>
                <strong>OpenRouter:</strong> {openrouterLabel(u)}
                {u.openrouter_key_hash_preview ? ` · ${u.openrouter_key_hash_preview}` : ''}
                {u.openrouter_key_created_at
                  ? ` · создан ${fmtDate(u.openrouter_key_created_at)}`
                  : ''}
              </div>
            </div>

            <h3 style={{ fontSize: '0.9rem' }}>Квота и подписка</h3>
            <div className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              <div>
                Квота:{' '}
                {u.quota_enabled
                  ? `$${Number(u.monthly_spent_usd || 0).toFixed(2)} / $${Number(u.monthly_cap_usd || 0).toFixed(2)} (осталось $${Number(u.monthly_remaining_usd || 0).toFixed(2)})`
                  : 'выключена'}
              </div>
              <div>
                Период: {fmtDate(u.subscription_period_start)} — {fmtDate(u.subscription_period_end)}
              </div>
              <div>
                Регистрация: {fmtDate(u.created_at)}
                {u.email_verified ? ' · email подтверждён' : ' · email не подтверждён'}
              </div>
              {u.auth_methods ? <div>Способы входа: {u.auth_methods}</div> : null}
            </div>

            <div className="tier-row">
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn btn-sm ${u.subscription_tier === t ? 'btn-primary' : ''}`}
                  disabled={busy}
                  onClick={() => grantTier(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="field">
              <label>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>Баланс USD</label>
              <input value={balance} onChange={(e) => setBalance(e.target.value)} type="number" step="0.01" />
            </div>
            <div className="field">
              <label>Новый пароль (мин. 6)</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => saveUser()}>
                Сохранить
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => saveUser({ refreshPolza: true })}>
                Обновить ключ Polza
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => saveUser({ refreshOpenrouter: true })}
              >
                Обновить ключ OpenRouter
              </button>
            </div>

            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Telegram:{' '}
              {u.telegram_linked
                ? `@${u.telegram_username || u.telegram_id}`
                : 'не привязан'}
              {u.has_google ? ` · Google: ${u.google_sub_preview}` : ''}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {u.telegram_linked ? (
                <button type="button" className="btn btn-sm" disabled={busy} onClick={unlinkTelegram}>
                  Отвязать Telegram
                </button>
              ) : null}
              {u.has_google ? (
                <button type="button" className="btn btn-sm" disabled={busy} onClick={unlinkGoogle}>
                  Отвязать Google
                </button>
              ) : null}
            </div>

            {detail.invoices?.length ? (
              <>
                <h3 style={{ fontSize: '0.9rem', marginTop: '1rem' }}>Счета</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>RUB</th>
                      <th>Статус</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.invoices.slice(0, 8).map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.id}</td>
                        <td>{inv.amount_rub}</td>
                        <td>{inv.status}</td>
                        <td>{fmtDate(inv.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}

            {detail.transactions?.length ? (
              <>
                <h3 style={{ fontSize: '0.9rem', marginTop: '1rem' }}>Транзакции</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Тип</th>
                      <th>USD</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.transactions.slice(0, 8).map((t) => (
                      <tr key={t.id}>
                        <td>{t.tx_type}</td>
                        <td>{t.amount_usd}</td>
                        <td>{fmtDate(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}

            <div className="danger-zone">
              <h3 style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>Удаление аккаунта</h3>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                Удалит пользователя, чаты, артефакты, тикеты и транзакции. Введите email для подтверждения.
              </p>
              <input
                className="field"
                style={{ width: '100%', marginBottom: '0.5rem' }}
                placeholder={u.email}
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
              <button type="button" className="btn btn-danger" disabled={busy} onClick={deleteUser}>
                Удалить навсегда
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
