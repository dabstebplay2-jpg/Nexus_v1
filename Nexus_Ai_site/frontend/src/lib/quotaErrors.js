/** Общая обработка исчерпания пула ИИ (cloud: 429, legacy: 402). */

const DEFAULT_QUOTA_MSG =
  'Месячный пул ИИ исчерпан. Продлите подписку или пополните баланс в разделе «Тарифы».';

export function throwIfQuotaHttpError(res, detail) {
  if (res.status === 429 || res.status === 402) {
    throw new Error(detail || DEFAULT_QUOTA_MSG);
  }
}

export { DEFAULT_QUOTA_MSG };
