const { attachmentsToApi } = require('./attachmentsApi');

async function parseApiJson(res) {
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const d = data.detail;
    const msg = typeof d === 'string' ? d : d?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function attFromWebview(items) {
  return attachmentsToApi(
    (items || []).map((a) => ({
      ...a,
      dataBase64: a.dataBase64 || a.data_base64,
    }))
  );
}

async function handleSupportMessage(msg, webview, auth) {
  const post = (payload) => webview.postMessage(payload);

  const setLoading = (loading) => post({ type: 'supportLoading', loading });

  try {
    if (msg.type === 'supportList') {
      setLoading(true);
      const res = await auth.cloudFetch('/support/tickets');
      const data = await parseApiJson(res);
      post({ type: 'supportTickets', tickets: data.tickets || [] });
      return;
    }

    if (msg.type === 'supportGet') {
      setLoading(true);
      const res = await auth.cloudFetch(`/support/tickets/${encodeURIComponent(msg.id)}`);
      const detail = await parseApiJson(res);
      post({ type: 'supportDetail', detail });
      return;
    }

    if (msg.type === 'supportCreate') {
      setLoading(true);
      const res = await auth.cloudFetch('/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          category: msg.category || 'question',
          subject: msg.subject,
          body: msg.body,
          attachments: attFromWebview(msg.attachments),
        }),
      });
      const detail = await parseApiJson(res);
      post({ type: 'supportCreated', detail });
      return;
    }

    if (msg.type === 'supportMessage') {
      setLoading(true);
      await auth.cloudFetch(`/support/tickets/${encodeURIComponent(msg.id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          body: msg.body,
          attachments: attFromWebview(msg.attachments),
        }),
      });
      const res = await auth.cloudFetch(`/support/tickets/${encodeURIComponent(msg.id)}`);
      const detail = await parseApiJson(res);
      post({ type: 'supportDetail', detail });
    }
  } catch (e) {
    post({ type: 'supportError', text: e.message || String(e) });
  } finally {
    setLoading(false);
  }
}

module.exports = { handleSupportMessage };
