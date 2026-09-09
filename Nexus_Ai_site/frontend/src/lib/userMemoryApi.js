import { apiFetch } from './apiClient';

export async function fetchUserMemory() {
  const res = await apiFetch('/user/memory');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Память: ${res.status}`);
  }
  return res.json();
}

export async function saveUserMemory({ content, enabled, auto_learn }) {
  const res = await apiFetch('/user/memory', {
    method: 'PUT',
    body: JSON.stringify({
      content: content || '',
      enabled: Boolean(enabled),
      auto_learn: auto_learn !== false,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Сохранение памяти: ${res.status}`);
  }
  return res.json();
}

export async function synthesizeUserMemory() {
  const res = await apiFetch('/user/memory/synthesize', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Синтез памяти: ${res.status}`);
  }
  return res.json();
}
