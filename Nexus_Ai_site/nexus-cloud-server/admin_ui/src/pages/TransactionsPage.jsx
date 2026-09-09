import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi';

export default function TransactionsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminFetch('/transactions?limit=200');
        setItems(data.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <h1 className="page-title">Транзакции</h1>
      {loading ? <p className="muted">Загрузка…</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
            <th>Тип</th>
            <th>USD</th>
            <th>Описание</th>
            <th>Дата</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td>{t.email}</td>
              <td>{t.tx_type}</td>
              <td>{t.amount_usd}</td>
              <td>{t.description || '—'}</td>
              <td>{(t.created_at || '').slice(0, 19).replace('T', ' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
