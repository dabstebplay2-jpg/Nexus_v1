import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi';

export default function LogsPage() {
  const [items, setItems] = useState([]);
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');

  const load = () => {
    const params = new URLSearchParams({ limit: '400' });
    if (level) params.set('level', level);
    if (q.trim()) params.set('q', q.trim());
    adminFetch(`/logs/server?${params}`).then((d) => setItems(d.items || []));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <h1 className="page-title">Логи сервера</h1>
      <div className="toolbar">
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Все уровни</option>
          <option value="ERROR">ERROR</option>
          <option value="WARNING">WARNING</option>
          <option value="INFO">INFO</option>
        </select>
        <input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn" onClick={load}>
          Обновить
        </button>
      </div>
      <pre className="pre-box">
        {items.length
          ? items
              .map((l) => `[${(l.at || '').slice(11, 19)}] ${l.level} ${l.logger}: ${l.message}`)
              .join('\n')
          : '(пусто — на Render логи сбрасываются после рестарта)'}
      </pre>
    </>
  );
}
