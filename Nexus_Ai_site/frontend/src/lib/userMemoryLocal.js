const STORAGE_KEY = 'nexus_user_memory_v1';

export function loadGuestMemory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { content: '', enabled: true, auto_learn: true };
    const data = JSON.parse(raw);
    return {
      content: typeof data.content === 'string' ? data.content : '',
      enabled: data.enabled !== false,
      auto_learn: data.auto_learn !== false,
    };
  } catch {
    return { content: '', enabled: true, auto_learn: true };
  }
}

export function saveGuestMemory({ content, enabled, auto_learn }) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      content: content || '',
      enabled: Boolean(enabled),
      auto_learn: auto_learn !== false,
      updatedAt: Date.now(),
    })
  );
}

export function clearGuestMemory() {
  localStorage.removeItem(STORAGE_KEY);
}
