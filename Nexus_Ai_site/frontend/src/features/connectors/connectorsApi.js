import { apiFetch } from '../../lib/apiClient';
import { API_BASE } from '../../lib/api';

export async function fetchConnectors() {
  const res = await apiFetch('/connectors');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось загрузить коннекторы');
  }
  return res.json();
}

export async function fetchConnectorsSummary() {
  const res = await apiFetch('/connectors/status/summary');
  if (!res.ok) return { connected: [] };
  return res.json();
}

export async function startConnectorOAuth(connectorId, returnTo) {
  const res = await apiFetch(`/connectors/${connectorId}/connect`, {
    method: 'POST',
    body: JSON.stringify({ return_to: returnTo || window.location.origin }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось начать подключение');
  }
  return res.json();
}

export function connectorOAuthRedirectUrl(connectorId, returnTo) {
  const base = API_BASE.replace(/\/v1\/?$/, '');
  const q = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
  return `${base}/v1/connectors/${connectorId}/connect${q}`;
}

export async function connectDiscordWebhook(webhookUrl, channelLabel) {
  const res = await apiFetch('/connectors/discord/webhook', {
    method: 'POST',
    body: JSON.stringify({ webhook_url: webhookUrl, channel_label: channelLabel }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось подключить Discord');
  }
  return res.json();
}

export async function disconnectConnector(connectorId) {
  const res = await apiFetch(`/connectors/${connectorId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось отключить');
  }
  return res.json();
}

export async function patchConnector(connectorId, enabledForChat) {
  const res = await apiFetch(`/connectors/${connectorId}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled_for_chat: enabledForChat }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось обновить');
  }
  return res.json();
}
