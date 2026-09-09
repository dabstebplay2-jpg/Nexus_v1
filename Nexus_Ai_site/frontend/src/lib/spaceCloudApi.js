import { apiFetch } from './apiClient';
import { sanitizeConversationForCloud } from './chatSyncAttachments';

function normalizeWorkspace(raw) {
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    name: String(raw.name || 'Моё пространство'),
    emoji: String(raw.emoji || '✨'),
    createdAt: raw.createdAt ?? raw.created_at ?? Date.now(),
    updatedAt: raw.updatedAt ?? raw.updated_at ?? Date.now(),
  };
}

function normalizeConversation(raw) {
  if (!raw?.id || !raw?.workspaceId) return null;
  return {
    id: String(raw.id),
    workspaceId: String(raw.workspaceId),
    title: raw.title || 'Новый диалог',
    model: raw.model || '',
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    createdAt: raw.createdAt ?? raw.created_at ?? Date.now(),
    updatedAt: raw.updatedAt ?? raw.updated_at ?? Date.now(),
  };
}

function normalizeState(data) {
  return {
    workspaces: (data?.workspaces || []).map(normalizeWorkspace).filter(Boolean),
    conversations: (data?.conversations || []).map(normalizeConversation).filter(Boolean),
  };
}

export async function fetchCloudSpaces() {
  const response = await apiFetch('/spaces');
  if (response.status === 401) throw new Error('UNAUTHORIZED');
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Не удалось загрузить пространства');
  }
  return normalizeState(await response.json());
}

export async function syncCloudSpaces(state) {
  const response = await apiFetch('/spaces/sync', {
    method: 'PUT',
    body: JSON.stringify({
      workspaces: (state.workspaces || []).slice(0, 40).map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        emoji: workspace.emoji || '✨',
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt || Date.now(),
      })),
      conversations: (state.conversations || []).slice(0, 240).map((conversation) => ({
        ...sanitizeConversationForCloud(conversation),
        workspaceId: conversation.workspaceId,
      })),
    }),
  });
  if (response.status === 401) throw new Error('UNAUTHORIZED');
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Не удалось синхронизировать пространства');
  }
  return normalizeState(await response.json());
}
