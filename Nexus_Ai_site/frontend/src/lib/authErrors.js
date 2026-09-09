export function parseAuthApiError(payload, status) {
  const detail = payload?.detail ?? payload?.message ?? payload;
  if (detail && typeof detail === 'object') {
    return {
      message: detail.message || 'Ошибка запроса',
      retryAfterSeconds:
        typeof detail.retry_after_seconds === 'number'
          ? Math.max(1, Math.ceil(detail.retry_after_seconds))
          : null,
      status,
    };
  }
  return {
    message: typeof detail === 'string' ? detail : 'Ошибка запроса',
    retryAfterSeconds: status === 429 ? 300 : null,
    status,
  };
}

export function formatRetryCountdown(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r} с`;
  return `${m} мин ${String(r).padStart(2, '0')} с`;
}

export function isGoogleMailbox(email) {
  const e = (email || '').trim().toLowerCase();
  const domain = e.split('@')[1];
  return domain === 'gmail.com' || domain === 'googlemail.com';
}
