import { CLOUD_PUBLIC_URL } from './api';

const BILLING_TEST_MODE =
  import.meta.env.VITE_BILLING_TEST_MODE === 'true' ||
  import.meta.env.VITE_TESTING_MODE === 'true';

let cache = null;

export async function loadTestingConfig() {
  if (cache) return cache;
  const base = CLOUD_PUBLIC_URL;
  if (!base) {
    cache = { testing_mode: import.meta.env.VITE_TESTING_MODE === 'true' };
    return cache;
  }
  try {
    const res = await fetch(`${base}/v1/health`);
    if (res.ok) {
      cache = await res.json();
      if (cache.testing_mode == null && import.meta.env.VITE_TESTING_MODE === 'true') {
        cache.testing_mode = true;
      }
      return cache;
    }
  } catch {
    /* ignore */
  }
  cache = { testing_mode: import.meta.env.VITE_TESTING_MODE === 'true' };
  return cache;
}

export function isTestingMode() {
  return Boolean(cache?.testing_mode || import.meta.env.VITE_TESTING_MODE === 'true');
}

export function clearTestingCache() {
  cache = null;
}

/**
 * Смена тарифа в тест-режиме:
 * 1) новый API /testing/set-tier (если сервер обновлён)
 * 2) billing/subscribe + subscribe/check (если NEXUS_BILLING_TEST_MODE на Render)
 */
export async function setTestingTier(tier, { subscribeToTier, checkSubscription } = {}) {
  const { apiFetch } = await import('./apiClient');

  const res = await apiFetch('/testing/set-tier', {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });

  if (res.ok) {
    clearTestingCache();
    return res.json();
  }

  if (res.status !== 404 || !subscribeToTier) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err.detail === 'string'
        ? err.detail
        : 'Не удалось сменить тариф. Обновите nexus-cloud на Render и включите NEXUS_TESTING_MODE=true.'
    );
  }

  const data = await subscribeToTier(tier);
  if (data.immediate || data.status === 'success' || data.status === 'paid') {
    clearTestingCache();
    return data;
  }

  if (data.invoice_id && BILLING_TEST_MODE && checkSubscription) {
    const paid = await checkSubscription(data.invoice_id);
    clearTestingCache();
    return paid;
  }

  if (data.invoice_id && !BILLING_TEST_MODE) {
    throw new Error(
      'На Render включите NEXUS_BILLING_TEST_MODE=true (Environment), затем Manual Deploy.'
    );
  }

  clearTestingCache();
  return data;
}

/** Авто ULTRA при входе в тест-режиме, если сейчас Free */
export async function ensureTestingUltra(profile, auth) {
  if (!isTestingMode() || !auth?.subscribeToTier) return;
  const tier = (profile?.subscription_tier || 'FREE').toUpperCase();
  if (tier !== 'FREE') return;
  try {
    await setTestingTier('ULTRA', auth);
  } catch (e) {
    console.warn('ensureTestingUltra:', e.message);
  }
}
