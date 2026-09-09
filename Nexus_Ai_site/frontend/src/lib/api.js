/**
 * API base URL.
 * Production on Vercel: same-origin /api (serverless → Render) — не блокируется как render.com у части ISP.
 * Локально: VITE_CLOUD_URL или /api proxy. Явный VITE_API_BASE переопределяет всё.
 */
/** На Vercel всегда same-origin /api — VITE_CLOUD_URL на Render ломает вход без VPN. */
function cloudPublicUrlFromEnv() {
  const raw = import.meta.env.VITE_CLOUD_URL?.replace(/\/$/, '') || '';
  if (!raw) return '';
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (/\.vercel\.app$/i.test(host) || host === 'nexus-zeta-ruby-12.vercel.app') {
      return '';
    }
  }
  return raw;
}

export const CLOUD_PUBLIC_URL = cloudPublicUrlFromEnv();

/** Прямой Render — fallback если /api на Vercel недоступен (404) */
export const CLOUD_FALLBACK_URL = (
  import.meta.env.VITE_CLOUD_FALLBACK_URL ||
  import.meta.env.VITE_CLOUD_URL ||
  'https://nexus-cloud-bxcc.onrender.com'
).replace(/\/$/, '');

export const DIRECT_CLOUD_API_BASE = `${CLOUD_FALLBACK_URL}/v1`;

function sameOriginApiBase() {
  if (typeof window !== 'undefined') return `${window.location.origin}/api`;
  return 'http://127.0.0.1:5173/api';
}

/** Синхронный default; в проде предпочтительно `getApiBase()`. */
export const API_BASE = (() => {
  const explicit = import.meta.env.VITE_API_BASE?.replace(/\/$/, '');
  if (explicit) return explicit;
  if (CLOUD_PUBLIC_URL) return `${CLOUD_PUBLIC_URL}/v1`;
  return sameOriginApiBase();
})();

let _resolvedApiBase = null;

/** Сбросить кэш базы API (если /api снова доступен после сбоя). */
export function resetCachedApiBase() {
  _resolvedApiBase = null;
}

/** Прод: /api (Vercel→Render) если отвечает JSON, иначе прямой Render (нужен VPN у части ISP). */
export async function getApiBase() {
  if (_resolvedApiBase) return _resolvedApiBase;
  const explicit = import.meta.env.VITE_API_BASE?.replace(/\/$/, '');
  if (explicit) {
    _resolvedApiBase = explicit;
    return _resolvedApiBase;
  }
  if (CLOUD_PUBLIC_URL) {
    _resolvedApiBase = `${CLOUD_PUBLIC_URL}/v1`;
    return _resolvedApiBase;
  }
  if (!import.meta.env.PROD || typeof window === 'undefined') {
    _resolvedApiBase = sameOriginApiBase();
    return _resolvedApiBase;
  }
  const proxy = `${window.location.origin}/api`;
  try {
    const r = await fetch(`${proxy}/auth/config`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('application/json')) {
      _resolvedApiBase = proxy;
      return proxy;
    }
  } catch {
    /* proxy недоступен */
  }
  _resolvedApiBase = DIRECT_CLOUD_API_BASE;
  return _resolvedApiBase;
}

export const USE_DIRECT_CLOUD = Boolean(CLOUD_PUBLIC_URL);

export const IS_VERCEL_HOST =
  typeof window !== 'undefined' && /\.vercel\.app$/i.test(window.location.hostname);

/** @deprecated Используйте usePricingCatalog() — цены в ₽ по курсу ЦБ */
export const TIERS = [];

export function tierById() {
  return { id: 'FREE', aiAccess: true, price: 0, credits: 0 };
}

export function tierHasAi() {
  return true;
}
