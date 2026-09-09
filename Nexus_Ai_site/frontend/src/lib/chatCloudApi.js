import { apiFetch } from './apiClient';

function normalizeConversation(raw) {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    title: raw.title || 'Новый чат',
    model: raw.model || '',
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    createdAt: raw.createdAt ?? raw.created_at ?? Date.now(),
    updatedAt: raw.updatedAt ?? raw.updated_at ?? Date.now(),
  };
}

export async function fetchCloudChats() {
  const res = await apiFetch('/chats');
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось загрузить историю чатов');
  }
  const data = await res.json();
  return (data.conversations || []).map(normalizeConversation).filter(Boolean);
}

export async function upsertCloudChat(conversation) {
  const res = await apiFetch(`/chats/${encodeURIComponent(conversation.id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: conversation.id,
      title: conversation.title || 'Новый чат',
      model: conversation.model || null,
      messages: conversation.messages || [],
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt ?? Date.now(),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось сохранить чат');
  }
  return normalizeConversation(await res.json());
}

export async function deleteCloudChat(chatId) {
  const res = await apiFetch(`/chats/${encodeURIComponent(chatId)}`, { method: 'DELETE' });
  if (res.status === 404) return;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось удалить чат');
  }
}

export async function importCloudChats(conversations) {
  const res = await apiFetch('/chats/import', {
    method: 'POST',
    body: JSON.stringify({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        model: c.model || null,
        messages: c.messages || [],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    }),
  });
  if (res.status === 409) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось импортировать чаты');
  }
  const data = await res.json();
  return (data.conversations || []).map(normalizeConversation).filter(Boolean);
}

export function activeChatStorageKey(email) {
  return `nexus_chat_active_${(email || '').toLowerCase()}`;
}

export function loadActiveChatId(email) {
  try {
    return localStorage.getItem(activeChatStorageKey(email));
  } catch {
    return null;
  }
}

export function saveActiveChatId(email, chatId) {
  try {
    const key = activeChatStorageKey(email);
    if (chatId) localStorage.setItem(key, chatId);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
