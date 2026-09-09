/** @typedef {import('react').MutableRefObject} MutableRefObject */

export const SHORTCUT_CATALOG = [
  { keys: 'Ctrl+T', label: 'Новая вкладка' },
  { keys: 'Ctrl+W', label: 'Закрыть вкладку' },
  { keys: 'Ctrl+Shift+T', label: 'Восстановить закрытую вкладку' },
  { keys: 'Ctrl+Tab', label: 'Следующая вкладка' },
  { keys: 'Ctrl+Shift+Tab', label: 'Предыдущая вкладка' },
  { keys: 'Ctrl+1–9', label: 'Перейти к вкладке по номеру' },
  { keys: 'Ctrl+R / F5', label: 'Обновить страницу' },
  { keys: 'Ctrl+L / Alt+D', label: 'Фокус на адресную строку' },
  { keys: 'Ctrl+D', label: 'Добавить в закладки' },
  { keys: 'Ctrl+B', label: 'Панель закладок' },
  { keys: 'Ctrl+F', label: 'Поиск на странице' },
  { keys: 'Ctrl+J', label: 'Загрузки' },
  { keys: 'Ctrl+H', label: 'История' },
  { keys: 'Ctrl+P', label: 'Печать' },
  { keys: 'Ctrl+Plus / Ctrl+- / Ctrl+0', label: 'Масштаб' },
  { keys: 'Alt+← / Alt+→', label: 'Назад / вперёд' },
  { keys: 'Ctrl+Shift+N', label: 'Вкладка инкогнито' },
  { keys: 'Ctrl+Shift+Delete', label: 'Очистить данные' },
  { keys: 'F11', label: 'Полный экран' },
  { keys: 'F12', label: 'Инструменты разработчика' },
  { keys: 'Ctrl+Shift+I', label: 'Инструменты разработчика' },
  { keys: 'Ctrl+Shift+J', label: 'Консоль разработчика' },
];

/**
 * @param {KeyboardEvent} e
 * @param {{
 *   tabId: string | null,
 *   tabList: Array<{ id: string, active?: boolean }>,
 *   omniboxRef?: MutableRefObject<HTMLInputElement | null>,
 *   onToggleFind: () => void,
 *   onStopFind: () => void,
 *   onNewTab: (incognito?: boolean) => void,
 *   onToggleBookmarksBar: () => void,
 *   onToggleBookmarksPanel: () => void,
 *   onToggleHistory: () => void,
 *   onToggleDownloads: () => void,
 *   onOpenPrivacy: () => void,
 *   onBookmark: () => void,
 *   showToast: (msg: string) => void,
 * }} ctx
 */
export function handleBrowserShortcut(e, ctx) {
  const mod = e.ctrlKey || e.metaKey;
  const tabId = ctx.tabId;
  const tabList = ctx.tabList || [];
  const api = window.nexusBrowser;

  if (mod && e.key === 'f') {
    e.preventDefault();
    ctx.onToggleFind();
    return;
  }
  if (mod && e.key === 't' && !e.shiftKey) {
    e.preventDefault();
    api.tabs.create();
    return;
  }
  if (mod && e.key === 'w') {
    e.preventDefault();
    if (tabId) api.tabs.close(tabId);
    return;
  }
  if (mod && e.shiftKey && (e.key === 'T' || e.key === 't')) {
    e.preventDefault();
    api.tabs.reopenClosed();
    ctx.showToast('Вкладка восстановлена');
    return;
  }
  if (mod && e.key === 'j') {
    e.preventDefault();
    ctx.onToggleDownloads();
    return;
  }
  if (mod && e.key === 'h') {
    e.preventDefault();
    ctx.onToggleHistory();
    return;
  }
  if (mod && e.key === 'p') {
    e.preventDefault();
    if (tabId) api.tabs.print(tabId);
    return;
  }
  if (mod && (e.key === 'r' || e.key === 'R') && !e.shiftKey) {
    e.preventDefault();
    if (tabId) api.tabs.reload(tabId);
    return;
  }
  if (e.key === 'F5') {
    e.preventDefault();
    if (tabId) api.tabs.reload(tabId);
    return;
  }
  if ((mod && e.key === 'l') || e.altKey && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault();
    ctx.omniboxRef?.current?.focus();
    ctx.omniboxRef?.current?.select();
    return;
  }
  if (mod && e.key === 'd') {
    e.preventDefault();
    ctx.onBookmark();
    return;
  }
  if (mod && e.key === 'b') {
    e.preventDefault();
    ctx.onToggleBookmarksBar();
    return;
  }
  if (mod && e.shiftKey && e.key === 'Delete') {
    e.preventDefault();
    ctx.onOpenPrivacy();
    return;
  }
  if (mod && e.key === '=') {
    e.preventDefault();
    if (tabId) api.tabs.getZoom(tabId).then((z) => api.tabs.setZoom(tabId, Math.min(3, z + 0.1)));
    return;
  }
  if (mod && e.key === '-') {
    e.preventDefault();
    if (tabId) api.tabs.getZoom(tabId).then((z) => api.tabs.setZoom(tabId, Math.max(0.25, z - 0.1)));
    return;
  }
  if (mod && e.key === '0') {
    e.preventDefault();
    if (tabId) api.tabs.setZoom(tabId, 1);
    return;
  }
  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    if (tabId) api.tabs.goBack(tabId);
    return;
  }
  if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    if (tabId) api.tabs.goForward(tabId);
    return;
  }
  if (e.key === 'F11') {
    e.preventDefault();
    api.window.toggleFullscreen();
    return;
  }
  if (e.key === 'F12') {
    e.preventDefault();
    if (tabId) api.tabs.toggleDevTools(tabId, 'default');
    return;
  }
  if (mod && e.shiftKey && e.key === 'I') {
    e.preventDefault();
    if (tabId) api.tabs.toggleDevTools(tabId, 'default');
    return;
  }
  if (mod && e.shiftKey && e.key === 'J') {
    e.preventDefault();
    if (tabId) api.tabs.toggleDevTools(tabId, 'console');
    return;
  }
  if (mod && e.shiftKey && e.key === 'N') {
    e.preventDefault();
    ctx.onNewTab(true);
    ctx.showToast('Открыта вкладка инкогнито');
    return;
  }
  if (mod && e.key === 'Tab') {
    e.preventDefault();
    const idx = tabList.findIndex((t) => t.active);
    const next = e.shiftKey
      ? tabList[(idx - 1 + tabList.length) % tabList.length]
      : tabList[(idx + 1) % tabList.length];
    if (next) api.tabs.activate(next.id);
    return;
  }
  if (mod && /^[1-9]$/.test(e.key)) {
    const target = tabList[Number(e.key) - 1];
    if (target) {
      e.preventDefault();
      api.tabs.activate(target.id);
    }
  }
}
