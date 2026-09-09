import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';

const FALLBACK_TIERS = [
  {
    id: 'FREE',
    name: 'Free',
    price_rub: 0,
    monthly_cap_rub: 0,
    quota_hint: 'Бесплатные модели OpenRouter · лимит запросов в сутки',
    ai_enabled: true,
    popular: false,
    features: [
      'Облачный ИИ на бесплатных моделях',
      'Локальный IDE',
      'Файлы и Git',
      'Терминал',
    ],
  },
  {
    id: 'HOBBY',
    name: 'Hobby',
    price_rub: 800,
    monthly_cap_rub: 736,
    pool_share_percent: 92,
    market_badge: '≈ ChatGPT Go',
    quota_hint: '~92% на ИИ · Flash · ориентир ChatGPT Go ($10)',
    ai_enabled: true,
    popular: false,
    features: ['Облачный ИИ', 'Бюджетные модели', 'Пул ~92% подписки на ИИ'],
  },
  {
    id: 'STANDARD',
    name: 'Standard',
    price_rub: 1600,
    monthly_cap_rub: 1472,
    pool_share_percent: 92,
    market_badge: '≈ Plus / Claude Pro',
    quota_hint: '~92% на ИИ · до Sonnet · ориентир Plus ($20)',
    ai_enabled: true,
    popular: true,
    features: ['Облачный ИИ', 'Модели до Sonnet', 'Пул ~92% подписки на ИИ'],
  },
  {
    id: 'PRO',
    name: 'Pro',
    price_rub: 8000,
    monthly_cap_rub: 7360,
    pool_share_percent: 92,
    market_badge: '5× пул Standard',
    quota_hint: '~92% на ИИ · Pro · ~5× пул Standard ($100)',
    ai_enabled: true,
    popular: false,
    features: ['Полный каталог Pro', '5× пул vs Standard', 'Пул ~92% подписки на ИИ'],
  },
  {
    id: 'ULTRA',
    name: 'Ultra',
    price_rub: 16000,
    monthly_cap_rub: 14720,
    pool_share_percent: 92,
    market_badge: '20× пул Standard',
    quota_hint: '~92% на ИИ · Ultra · ~20× пул Standard ($200)',
    ai_enabled: true,
    popular: false,
    features: ['Все модели', '20× пул vs Standard', 'Пул ~92% подписки на ИИ'],
  },
];

function formatRubShort(n) {
  return `${Math.round(n || 0).toLocaleString('ru-RU')} ₽`;
}

function tierToUi(t) {
  const capRub =
    t.monthly_cap_rub ?? t.monthly_quota_rub ?? t.daily_cap_rub ?? t.daily_quota_rub ?? 0;
  const hint = t.quota_hint || '';
  const marketBadge = (t.market_badge || '').trim();
  const poolPct =
    t.pool_share_percent ?? (t.price_rub > 0 ? Math.round((capRub / t.price_rub) * 100) : 0);
  const features =
    t.id === 'FREE' && t.ai_enabled
      ? [
          'Бесплатные модели OpenRouter',
          hint || 'Лимит запросов в сутки',
          'Локальный IDE',
          'Файлы и Git',
          'Терминал',
        ]
      : t.ai_enabled
        ? [
            'Облачный ИИ Polza.ai',
            `Пул ≈ ${formatRubShort(capRub)}/мес на вашем ключе (30 дней)`,
            '~92% оплаты → пул ИИ (8% — комиссия Nexus); ключ выдаётся автоматически',
            hint,
            'Модели по тарифу',
          ]
        : ['Локальный IDE', 'Файлы и Git', 'Терминал', 'Без облачного ИИ'];
  return {
    id: t.id,
    name: t.name || t.label || t.id,
    price: t.price_rub ?? 0,
    price_rub: t.price_rub ?? 0,
    monthlyQuotaRub: capRub,
    monthly_cap_rub: capRub,
    dailyQuotaRub: capRub,
    daily_cap_rub: capRub,
    quotaHint: hint,
    marketBadge,
    poolSharePercent: poolPct,
    aiAccess: Boolean(t.ai_enabled),
    popular: Boolean(t.popular),
    desc:
      t.price_rub > 0
        ? `Подписка ${formatRubShort(t.price_rub)}/мес — на ИИ ${formatRubShort(capRub)} (~${poolPct}%)`
        : 'Локальный Nexus IDE без облачного ИИ.',
    features,
  };
}

export function usePricingCatalog() {
  const [tiers, setTiers] = useState(() => FALLBACK_TIERS.map(tierToUi));
  const [usdRub, setUsdRub] = useState(null);
  const [rateMeta, setRateMeta] = useState({ source: 'cbr', rateDate: null, fetchedAt: null });
  const [loading, setLoading] = useState(true);
  const [promoEnabled, setPromoEnabled] = useState(false);
  const [promoHints, setPromoHints] = useState([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/billing/catalog');
      if (!res.ok) throw new Error('catalog');
      const data = await res.json();
      setUsdRub(data.usd_rub_rate ?? null);
      setRateMeta({
        source: data.rate_source || 'cbr',
        rateDate: data.rate_date || null,
        fetchedAt: data.rate_fetched_at || null,
      });
      if (Array.isArray(data.tiers) && data.tiers.length) {
        setTiers(data.tiers.map(tierToUi));
      }
      setPromoEnabled(Boolean(data.promo_codes_enabled));
      setPromoHints(Array.isArray(data.promo_hints) ? data.promo_hints : []);
    } catch {
      setTiers(FALLBACK_TIERS.map(tierToUi));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { tiers, usdRub, rateMeta, promoEnabled, promoHints, loading, reload };
}

export function tierByIdFromList(tiers, id) {
  return tiers.find((t) => t.id === id) ?? tiers[0];
}

export function tierHasAiFromList(tiers, tierId) {
  return tierByIdFromList(tiers, tierId).aiAccess;
}
