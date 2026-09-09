/** Telegram Login Widget работает только на домене из BotFather /setdomain. */

export function isTelegramWidgetAllowed(loginDomain) {
  if (typeof window === 'undefined') return false;
  const allowed = (loginDomain || '').trim().toLowerCase();
  if (!allowed) return false;
  return window.location.hostname.toLowerCase() === allowed;
}

export function telegramBotUrl(username) {
  const u = (username || '').replace(/^@/, '');
  return u ? `https://t.me/${u}` : 'https://t.me/';
}
