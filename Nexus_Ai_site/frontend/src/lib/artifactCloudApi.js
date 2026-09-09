import { apiFetch } from './apiClient';

function normalize(raw) {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    kind: raw.kind || 'file',
    title: raw.title || 'Артефакт',
    preview: raw.preview || null,
    content: raw.content || {},
    sourceChatId: raw.sourceChatId ?? raw.source_chat_id ?? null,
    sourceMessageId: raw.sourceMessageId ?? raw.source_message_id ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? Date.now(),
  };
}

export async function fetchCloudArtifacts() {
  const res = await apiFetch('/artifacts');
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось загрузить артефакты');
  }
  const data = await res.json();
  return (data.artifacts || []).map(normalize).filter(Boolean);
}

export async function syncCloudArtifacts(artifacts) {
  const res = await apiFetch('/artifacts/sync', {
    method: 'PUT',
    body: JSON.stringify({
      artifacts: (artifacts || []).map((a) => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
        preview: a.preview,
        content: a.content,
        sourceChatId: a.sourceChatId,
        sourceMessageId: a.sourceMessageId,
        createdAt: a.createdAt,
      })),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось синхронизировать артефакты');
  }
  const data = await res.json();
  return (data.artifacts || []).map(normalize).filter(Boolean);
}

export async function upsertCloudArtifact(artifact) {
  const res = await apiFetch(`/artifacts/${encodeURIComponent(artifact.id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      preview: artifact.preview,
      content: artifact.content,
      sourceChatId: artifact.sourceChatId,
      sourceMessageId: artifact.sourceMessageId,
      createdAt: artifact.createdAt,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось сохранить артефакт');
  }
  return normalize(await res.json());
}

export async function deleteCloudArtifact(id) {
  const res = await apiFetch(`/artifacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.status === 404) return;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось удалить артефакт');
  }
}
