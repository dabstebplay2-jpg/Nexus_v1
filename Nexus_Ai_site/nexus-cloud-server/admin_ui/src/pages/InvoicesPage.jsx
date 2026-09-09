import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi';

export default function InvoicesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminFetch('/invoices?limit=200');
        setItems(data.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <h1 className="page-title">Счета</h1>
      {loading ? <p className="muted">Загрузка…</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
            <th>Статус</th>
            <th>₽</th>
            <th>Тариф</th>
            <th>Дата</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.id}</td>
              <td>{i.email}</td>
              <td>
                <span className={`badge ${i.status === 'paid' ? 'badge-paid' : 'badge-warn'}`}>{i.status}</span>
              </td>
              <td>{Number(i.amount_rub || 0).toFixed(0)}</td>
              <td>{i.subscription_tier || '—'}</td>
              <td>{(i.created_at || '').slice(0, 19).replace('T', ' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
