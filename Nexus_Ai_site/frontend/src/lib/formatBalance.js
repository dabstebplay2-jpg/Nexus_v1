/** Безопасное отображение баланса (защита от битых значений в БД). */
export function normalizeBalance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) > 1_000_000) return 0;
  return n;
}

export function formatBalanceUsd(value, { digits = 2 } = {}) {
  const n = normalizeBalance(value);
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(digits)}`;
}

/** Отображение суммы в рублях (основная валюта интерфейса). */
export function formatBalanceRub(value, { digits = 0, compact = false } = {}) {
  const n = normalizeBalance(value);
  if (n === 0) return '0 ₽';
  const formatted =
    compact && n >= 1000
      ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} тыс. ₽`
      : `${n.toLocaleString('ru-RU', {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        })} ₽`;
  return formatted;
}

export function formatUsdRubRate(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return '';
  return `1 $ = ${r.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}
