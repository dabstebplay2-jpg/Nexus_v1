/** Map fetch/stream errors to user-facing Russian messages for chat. */

export function mapChatError(err, { aborted = false } = {}) {
  if (aborted) return 'Генерация остановлена.';

  const name = err?.name || '';
  const msg = (err?.message || String(err || '')).trim();

  if (name === 'AbortError' || /aborted/i.test(msg)) {
    return 'Генерация остановлена.';
  }

  if (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('нет связи')
  ) {
    return 'Сервер просыпается или нет связи (до ~1 мин на бесплатном тарифе). Повторите отправку.';
  }

  if (name === 'AbortError' || msg.includes('abort') || msg.includes('Соединение оборвалось')) {
    if (msg.includes('Соединение оборвалось')) return msg;
    return 'Генерация остановлена.';
  }

  if (msg.includes('истекла') || msg.includes('Войдите') || msg.includes('авториз')) {
    return msg;
  }

  if (
    msg.includes('Polza') ||
    msg.includes('ключ') ||
    msg.includes('503') ||
    msg.includes('инференс') ||
    msg.includes('inference')
  ) {
    return `${msg} Откройте Настройки → раздел с ключом ИИ («Починить ключ ИИ»).`;
  }

  if (msg.includes('Сервер не ответил') || msg.includes('таймаут')) {
    return 'Сервер не ответил вовремя. Подождите минуту и повторите отправку.';
  }

  return msg || 'Не удалось получить ответ. Попробуйте ещё раз.';
}

export function isQuotaErrorMessage(msg) {
  const t = msg || '';
  return (
    t.includes('квот') ||
    t.includes('Квот') ||
    t.includes('402') ||
    t.includes('429') ||
    t.includes('исчерпан') ||
    t.includes('Пул ИИ') ||
    t.includes('пул ИИ') ||
    t.includes('лимит') ||
    t.includes('период подписки') ||
    t.includes('Недостаточно')
  );
}
