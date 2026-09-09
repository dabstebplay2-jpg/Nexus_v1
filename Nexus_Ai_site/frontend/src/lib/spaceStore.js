const STORAGE_KEY = 'nexus_spaces_v1';

export function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_STATE = () => ({
  workspaces: [{ id: 'ws_default', name: 'Моё пространство', emoji: '✨', createdAt: Date.now() }],
  conversations: [],
  activeWorkspaceId: 'ws_default',
  activeConversationId: null,
  sidebarCollapsed: false,
});

export function loadSpaceState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE();
    return { ...DEFAULT_STATE(), ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE();
  }
}

export function saveSpaceState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function conversationsForWorkspace(conversations, workspaceId) {
  return conversations
    .filter((c) => c.workspaceId === workspaceId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function titleFromMessage(text) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Новый диалог';
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

export function groupConversationsByDate(conversations) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;
  const groups = { today: [], yesterday: [], week: [], older: [] };
  for (const c of conversations) {
    const t = c.updatedAt || c.createdAt || 0;
    if (t >= today) groups.today.push(c);
    else if (t >= yesterday) groups.yesterday.push(c);
    else if (t >= week) groups.week.push(c);
    else groups.older.push(c);
  }
  return groups;
}
