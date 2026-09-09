import { normalizeChatMessage } from './normalizeArrays';

/** Только гостевые черновики (без аккаунта). */
const GUEST_STORAGE_KEY = 'nexus_chat_guest_v2';
/** Устаревший ключ: сюда ошибочно попадали чаты аккаунта — не читаем. */
const LEGACY_ACCOUNT_LEAK_KEY = 'nexus_chat_v2';

export function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_STATE = () => ({
  conversations: [],
  activeConversationId: null,
  sidebarCollapsed: false,
});

function migrateFromV1() {
  try {
    const raw = localStorage.getItem('nexus_chat_v1');
    if (!raw) return null;
    const old = JSON.parse(raw);
    const chats = (old.conversations || []).filter((c) => !c.workspaceId);
    return {
      conversations: chats,
      activeConversationId: old.activeConversationId,
      sidebarCollapsed: old.sidebarCollapsed ?? false,
    };
  } catch {
    return null;
  }
}

function normalizeConversation(c) {
  if (!c || typeof c !== 'object' || !c.id) return null;
  const messages = Array.isArray(c.messages)
    ? c.messages.map((m) => normalizeChatMessage(m))
    : [];
  return {
    ...c,
    id: c.id,
    title: c.title || 'Новый чат',
    messages,
    model: c.model || '',
    createdAt: c.createdAt ?? Date.now(),
    updatedAt: c.updatedAt ?? Date.now(),
  };
}

function normalizeChatState(raw) {
  const base = DEFAULT_STATE();
  if (!raw || typeof raw !== 'object') return base;
  const conversations = Array.isArray(raw.conversations)
    ? raw.conversations.map(normalizeConversation).filter(Boolean)
    : [];
  return {
    ...base,
    ...raw,
    conversations,
    activeConversationId: raw.activeConversationId ?? null,
    sidebarCollapsed: Boolean(raw.sidebarCollapsed),
  };
}

export function loadChatState() {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      return normalizeChatState(JSON.parse(raw));
    }
    const migrated = migrateFromV1();
    if (migrated) {
      const state = normalizeChatState(migrated);
      saveChatState(state);
      return state;
    }
    return DEFAULT_STATE();
  } catch {
    return DEFAULT_STATE();
  }
}

export function saveChatState(state) {
  localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
}

/** Удалить устаревший кэш, куда попадала история аккаунта. */
export function purgeLegacyAccountChatCache() {
  try {
    localStorage.removeItem(LEGACY_ACCOUNT_LEAK_KEY);
  } catch {
    /* ignore */
  }
}

/** Сброс после выхода из аккаунта. */
export function clearChatState() {
  try {
    localStorage.removeItem(GUEST_STORAGE_KEY);
    purgeLegacyAccountChatCache();
  } catch {
    /* ignore */
  }
  return DEFAULT_STATE();
}

export function getDefaultChatState() {
  return DEFAULT_STATE();
}

export function titleFromMessage(text) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Новый чат';
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

export function groupConversationsByDate(conversations) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;
  const groups = { today: [], yesterday: [], week: [], older: [] };
  for (const c of [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) {
    const t = c.updatedAt || c.createdAt || 0;
    if (t >= today) groups.today.push(c);
    else if (t >= yesterday) groups.yesterday.push(c);
    else if (t >= week) groups.week.push(c);
    else groups.older.push(c);
  }
  return groups;
}
