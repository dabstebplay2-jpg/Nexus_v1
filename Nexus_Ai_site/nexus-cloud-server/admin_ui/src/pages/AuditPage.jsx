import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi';

export default function AuditPage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    adminFetch('/logs/admin-actions?limit=200').then((d) => setItems(d.items || []));
  }, []);

  return (
    <>
      <h1 className="page-title">Действия админа</h1>
      <table className="data-table">
        <thead>
          <tr>
            <th>Время</th>
            <th>Действие</th>
            <th>Детали</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a, i) => (
            <tr key={i}>
              <td>{(a.at || '').slice(0, 19).replace('T', ' ')}</td>
              <td>{a.action}</td>
              <td>{a.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
