export const TAB_GROUP_COLORS = {
  grey: '#9ca3af',
  blue: '#3b82f6',
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
  pink: '#ec4899',
  purple: '#a855f7',
  cyan: '#06b6d4',
};

/** @param {Array} tabs @param {Array} groups */
export function buildTabStripModel(tabs, groups) {
  const byId = Object.fromEntries((groups || []).map((g) => [g.id, g]));
  const rendered = [];
  let prevGroupId = null;

  tabs.forEach((tab) => {
    if (tab.groupId && tab.groupId !== prevGroupId) {
      const group = byId[tab.groupId];
      if (group) rendered.push({ kind: 'group', group });
    }
    prevGroupId = tab.groupId || null;
    const group = tab.groupId ? byId[tab.groupId] : null;
    if (!group?.collapsed) {
      rendered.push({ kind: 'tab', tab, groupColor: group?.color });
    }
  });

  return rendered;
}
