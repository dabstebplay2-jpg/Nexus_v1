import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi';
import { useToast } from '../context/ToastContext';

const CAT = { complaint: 'Жалоба', question: 'Вопрос', bug: 'Баг', other: 'Другое' };

export default function SupportPage() {
  const { push } = useToast();
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadTickets = async () => {
    const qs = statusFilter ? `?status=${statusFilter}` : '';
    const data = await adminFetch(`/support/tickets${qs}`);
    setTickets(data.tickets || []);
  };

  const loadDetail = async (id) => {
    const data = await adminFetch(`/support/tickets/${encodeURIComponent(id)}`);
    setDetail(data);
    setSelected(id);
  };

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    try {
      await adminFetch(`/support/tickets/${encodeURIComponent(selected)}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim(), attachments: [] }),
      });
      push('Ответ отправлен');
      setReply('');
      loadDetail(selected);
      loadTickets();
    } catch (e) {
      push(e.message, 'err');
    }
  };

  const setStatus = async (status) => {
    if (!selected) return;
    try {
      await adminFetch(`/support/tickets/${encodeURIComponent(selected)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      loadDetail(selected);
      loadTickets();
    } catch (e) {
      push(e.message, 'err');
    }
  };

  return (
    <>
      <h1 className="page-title">Поддержка</h1>
      <div className="toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Все</option>
          <option value="open">open</option>
          <option value="answered">answered</option>
          <option value="closed">closed</option>
        </select>
      </div>
      <div className="support-layout">
        <div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Email</th>
                <th>Статус</th>
                <th>Тема</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr
                  key={t.id}
                  className={`clickable ${selected === t.id ? '' : ''}`}
                  onClick={() => loadDetail(t.id)}
                  style={selected === t.id ? { background: 'var(--accent-dim)' } : undefined}
                >
                  <td>{(t.updated_at || '').slice(0, 10)}</td>
                  <td>{t.user_email}</td>
                  <td>{t.status}</td>
                  <td>{t.subject}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          {!detail ? (
            <p className="muted">Выберите тикет</p>
          ) : (
            <>
              <h2 style={{ fontSize: '1rem', margin: '0 0 0.25rem' }}>{detail.subject}</h2>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                {detail.user_email} · {CAT[detail.category] || detail.category} · {detail.status}
              </p>
              <div style={{ margin: '0.75rem 0' }}>
                {detail.status !== 'closed' ? (
                  <button type="button" className="btn btn-sm" onClick={() => setStatus('closed')}>
                    Закрыть
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => setStatus('open')}>
                    Открыть снова
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: '0.75rem' }}>
                {(detail.messages || []).map((m) => (
                  <div key={m.id} className={`support-msg ${m.author === 'admin' ? 'admin' : ''}`}>
                    <div className="muted" style={{ fontSize: '0.72rem', marginBottom: 4 }}>
                      {m.author === 'admin' ? 'Админ' : 'Пользователь'} ·{' '}
                      {(m.created_at || '').slice(0, 16).replace('T', ' ')}
                    </div>
                    {m.body}
                  </div>
                ))}
              </div>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  borderRadius: 8,
                  padding: 8,
                }}
                placeholder="Ответ поддержки…"
              />
              <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={sendReply}>
                Отправить
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
