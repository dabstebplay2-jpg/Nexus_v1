import { useCallback, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { attachmentsToApi } from '../lib/attachments';

const MAX_SUPPORT_ATTACH = 4;

async function parseJson(res) {
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const d = data.detail;
    let msg = typeof d === 'string' ? d : d?.message || `HTTP ${res.status}`;
    if (res.status === 404) {
      msg = 'Сервис поддержки временно обновляется. Попробуйте ещё раз чуть позже.';
    } else if (res.status === 401) {
      msg = 'Войдите в аккаунт на сайте, чтобы отправить обращение.';
    }
    throw new Error(msg);
  }
  return data;
}

export function useSupport() {
  const [tickets, setTickets] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const clearTicket = useCallback(() => setDetail(null), []);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/support/tickets');
      const data = await parseJson(res);
      setTickets(data.tickets || []);
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTicket = useCallback(async (ticketId) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/support/tickets/${encodeURIComponent(ticketId)}`);
      const data = await parseJson(res);
      setDetail(data);
      return data;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const createTicket = useCallback(async ({ category, subject, body, attachments }) => {
    setLoading(true);
    setError('');
    try {
      const att = attachmentsToApi((attachments || []).slice(0, MAX_SUPPORT_ATTACH));
      const res = await apiFetch('/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          category,
          subject,
          body,
          attachments: att,
        }),
      });
      const data = await parseJson(res);
      setDetail(data);
      await loadTickets();
      return data;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadTickets]);

  const sendMessage = useCallback(
    async (ticketId, { body, attachments }) => {
      setLoading(true);
      setError('');
      try {
        const att = attachmentsToApi((attachments || []).slice(0, MAX_SUPPORT_ATTACH));
        const res = await apiFetch(`/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ body, attachments: att }),
        });
        await parseJson(res);
        const updated = await loadTicket(ticketId);
        await loadTickets();
        return updated;
      } catch (e) {
        setError(e.message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [loadTicket, loadTickets]
  );

  return {
    tickets,
    detail,
    loading,
    error,
    setError,
    loadTickets,
    loadTicket,
    createTicket,
    sendMessage,
    clearTicket,
    maxAttachments: MAX_SUPPORT_ATTACH,
  };
}
