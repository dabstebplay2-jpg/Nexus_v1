import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi';
import { useToast } from '../context/ToastContext';

export default function RouterAiPage() {
  const { push } = useToast();
  const [pool, setPool] = useState(null);
  const [funding, setFunding] = useState(null);
  const [openrouter, setOpenrouter] = useState(null);
  const [deposit, setDeposit] = useState('');

  const load = async () => {
    const [p, f, or] = await Promise.all([
      adminFetch('/polza/pool-status').catch(() => null),
      adminFetch('/platform/funding').catch(() => null),
      adminFetch('/openrouter/status').catch(() => null),
    ]);
    setPool(p);
    setFunding(f);
    setOpenrouter(or);
    if (f?.polza_org_balance_rub != null) setDeposit(String(Math.round(f.polza_org_balance_rub)));
    else if (f?.routerai_deposit_rub != null) setDeposit(String(Math.round(f.routerai_deposit_rub)));
  };

  useEffect(() => {
    load();
  }, []);

  const saveDeposit = async () => {
    try {
      await adminFetch('/platform/polza-deposit', {
        method: 'PATCH',
        body: JSON.stringify({ deposit_rub: Number(deposit) }),
      });
      push('Баланс Polza обновлён');
      load();
    } catch (e) {
      push(e.message, 'err');
    }
  };

  const verifyMaster = async () => {
    try {
      const r = await adminFetch('/polza/verify-backend');
      push(r.message || 'Мастер-ключ OK');
    } catch (e) {
      push(e.message, 'err');
    }
  };

  const verifyOpenrouter = async () => {
    try {
      const r = await adminFetch('/openrouter/verify-management', { method: 'POST' });
      push(r.message || 'Management API OK');
    } catch (e) {
      push(e.message, 'err');
    }
  };

  return (
    <>
      <h1 className="page-title">ИИ-провайдеры</h1>
      <div className="toolbar">
        <button type="button" className="btn" onClick={load}>
          Обновить
        </button>
      </div>

      <h2 style={{ fontSize: '1rem', marginTop: '1.25rem' }}>Polza.ai</h2>
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={verifyMaster}>
          Проверить backend-ключ
        </button>
      </div>
      <div className="field" style={{ maxWidth: 280 }}>
        <label>Баланс org (₽)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" step="0.01" />
          <button type="button" className="btn btn-primary" onClick={saveDeposit}>
            OK
          </button>
        </div>
      </div>
      <pre className="pre-box">{JSON.stringify({ pool, funding }, null, 2)}</pre>

      <h2 style={{ fontSize: '1rem', marginTop: '1.5rem' }}>OpenRouter (FREE)</h2>
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={verifyOpenrouter}>
          Проверить Management key
        </button>
      </div>
      {openrouter ? (
        <div className="muted" style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>
          <div>
            Management API:{' '}
            <strong>{openrouter.management_configured ? 'настроен' : 'не настроен'}</strong>
          </div>
          <div>
            Общий fallback-ключ:{' '}
            <strong>{openrouter.shared_fallback_configured ? 'есть' : 'нет'}</strong>
          </div>
          <div>
            Пользователей с per-user ключом: <strong>{openrouter.users_with_key ?? 0}</strong>
          </div>
          <div>
            Лимит ключа:{' '}
            <strong>
              {openrouter.free_key_limit_usd != null
                ? `$${openrouter.free_key_limit_usd}`
                : 'без лимита'}
            </strong>
            {openrouter.limit_reset ? ` · сброс: ${openrouter.limit_reset}` : ''}
          </div>
        </div>
      ) : (
        <p className="muted">Не удалось загрузить статус OpenRouter</p>
      )}
      <pre className="pre-box">{JSON.stringify(openrouter, null, 2)}</pre>
    </>
  );
}
