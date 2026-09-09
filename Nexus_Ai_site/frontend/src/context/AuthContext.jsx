import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DIRECT_CLOUD_API_BASE, getApiBase } from '../lib/api';
import { apiFetch } from '../lib/apiClient';
import { clearStoredTokens, getStoredTokens, saveStoredTokens } from '../lib/authStorage';
import { clearChatState } from '../lib/chatStore';
import { normalizeBalance } from '../lib/formatBalance';
import { parseAuthApiError } from '../lib/authErrors';

const AuthContext = createContext(null);

const GUEST_SETTINGS_SECTIONS = new Set(['general', 'memory']);

function normalizeSettingsSection(section) {
  // `search` was used by older deep links. Search preferences now live in the
  // general section, so keep those links working instead of opening auth.
  return section === 'search' ? 'general' : section || 'general';
}

export function AuthProvider({ children }) {
  const [authStatus, setAuthStatus] = useState({ authorized: false, profile: null });
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('general');

  const envGoogleEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true';
  const [googleOAuthAvailable, setGoogleOAuthAvailable] = useState(envGoogleEnabled);
  const [telegramAuthEnabled, setTelegramAuthEnabled] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState('');
  const [telegramLoginDomain, setTelegramLoginDomain] = useState('');
  const [authConfigLoaded, setAuthConfigLoaded] = useState(false);
  const [authConfig, setAuthConfig] = useState(null);
  const [emailAuthEnabled, setEmailAuthEnabled] = useState(true);

  const fetchAuthConfigFrom = async (base) => {
    const url = `${base.replace(/\/$/, '')}/auth/config`;
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return res.json();
  };

  const loadAuthConfig = useCallback(async () => {
    try {
      let data = null;
      try {
        const base = await getApiBase();
        data = await fetchAuthConfigFrom(base);
      } catch {
        /* try direct cloud */
      }
      if (!data && import.meta.env.PROD) {
        try {
          data = await fetchAuthConfigFrom(DIRECT_CLOUD_API_BASE);
        } catch {
          /* keep env fallback */
        }
      }
      if (data) {
        setAuthConfig(data);
        setGoogleOAuthAvailable(Boolean(data.google_oauth_enabled));
        setEmailAuthEnabled(data.email_auth_enabled !== false);
        setTelegramAuthEnabled(Boolean(data.telegram_auth_enabled));
        setTelegramBotUsername((data.telegram_bot_username || '').replace(/^@/, ''));
        setTelegramLoginDomain((data.telegram_login_domain || '').trim().toLowerCase());
      } else if (envGoogleEnabled) {
        setGoogleOAuthAvailable(true);
      }
    } catch {
      if (envGoogleEnabled) setGoogleOAuthAvailable(true);
    } finally {
      setAuthConfigLoaded(true);
    }
  }, [envGoogleEnabled]);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiFetch('/auth/profile');
      if (res.status === 401) {
        clearStoredTokens();
        setAuthStatus({ authorized: false, profile: null });
        return false;
      }
      if (res.ok) {
        const data = await res.json();
        const status =
          'authorized' in data
            ? data
            : data?.email
              ? { authorized: true, profile: data }
              : { authorized: false, profile: null };
        setAuthStatus(status);
        return status.authorized;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  }, []);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const res = await apiFetch('/billing/history');
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadAuthConfig();
      const ok = await fetchProfile();
      if (ok) await fetchTransactions();
      setLoading(false);
    })();
  }, [fetchProfile, fetchTransactions, loadAuthConfig]);

  const openAuthModal = useCallback(() => setAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

  const openSettingsModal = useCallback(
    (section = 'general') => {
      const normalizedSection = normalizeSettingsSection(section);
      if (!authStatus.authorized && !GUEST_SETTINGS_SECTIONS.has(normalizedSection)) {
        setAuthModalOpen(true);
        return;
      }
      setSettingsSection(normalizedSection);
      setSettingsOpen(true);
    },
    [authStatus.authorized]
  );

  const closeSettingsModal = useCallback(() => setSettingsOpen(false), []);

  const applyTokens = useCallback(
    async (data) => {
      if (data.access_token) {
        saveStoredTokens(data.access_token, data.refresh_token || '');
      }
      await fetchProfile();
      await fetchTransactions();
    },
    [fetchProfile, fetchTransactions]
  );

  const requestEmailCode = async (email) => {
    const res = await apiFetch('/auth/email/request-code', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const parsed = parseAuthApiError(body, res.status);
      const err = new Error(parsed.message);
      if (parsed.retryAfterSeconds) err.retryAfterSeconds = parsed.retryAfterSeconds;
      throw err;
    }
    return res.json();
  };

  const verifyEmailCode = async (email, code) => {
    const res = await apiFetch('/auth/email/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const parsed = parseAuthApiError(body, res.status);
      throw new Error(parsed.message);
    }
    const data = await res.json();
    await applyTokens(data);
    return data;
  };

  const startGoogleLogin = useCallback(
    async (loginHint) => {
      if (!googleOAuthAvailable) {
        throw new Error('Вход через Google временно недоступен. Попробуйте позже.');
      }
      const returnTo = typeof window !== 'undefined' ? window.location.origin : '';
      const params = new URLSearchParams({ return_to: returnTo });
      const hint = (loginHint || '').trim().toLowerCase();
      if (hint && hint.includes('@')) params.set('login_hint', hint);
      const base = await getApiBase();
      window.location.href = `${base}/auth/google/start?${params.toString()}`;
    },
    [googleOAuthAvailable]
  );

  const completeGoogleExchange = useCallback(
    async (exchangeCode) => {
      const res = await apiFetch('/auth/google/exchange', {
        method: 'POST',
        body: JSON.stringify({ code: exchangeCode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail =
          typeof err.detail === 'string'
            ? err.detail
            : err.detail?.message || 'Ошибка входа через Google';
        throw new Error(detail);
      }
      const data = await res.json();
      await applyTokens(data);
    },
    [applyTokens]
  );

  const completeTelegramExchange = useCallback(
    async (exchangeCode) => {
      const res = await apiFetch('/auth/telegram/exchange', {
        method: 'POST',
        body: JSON.stringify({ code: exchangeCode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail =
          typeof err.detail === 'string'
            ? err.detail
            : err.detail?.message || 'Ошибка входа через Telegram';
        throw new Error(detail);
      }
      const data = await res.json();
      await applyTokens(data);
    },
    [applyTokens]
  );

  const linkTelegramFromExchange = useCallback(
    async (exchangeCode) => {
      const res = await apiFetch('/telegram/link-from-exchange', {
        method: 'POST',
        body: JSON.stringify({ code: exchangeCode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail =
          typeof err.detail === 'string'
            ? err.detail
            : err.detail?.message || 'Не удалось привязать Telegram';
        throw new Error(detail);
      }
      await fetchProfile();
    },
    [fetchProfile]
  );

  const completeTelegramLogin = useCallback(
    async (widgetUser) => {
      const res = await apiFetch('/auth/telegram/login', {
        method: 'POST',
        body: JSON.stringify(widgetUser),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail =
          typeof err.detail === 'string'
            ? err.detail
            : err.detail?.message || 'Ошибка входа через Telegram';
        throw new Error(detail);
      }
      const data = await res.json();
      await applyTokens(data);
      closeAuthModal();
    },
    [applyTokens, closeAuthModal]
  );

  const requestBindEmail = async (newEmail) => {
    const res = await apiFetch('/auth/email/bind-request', {
      method: 'POST',
      body: JSON.stringify({ email: newEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось отправить код');
    }
    return data;
  };

  const verifyBindEmail = async (newEmail, code) => {
    const res = await apiFetch('/auth/email/bind-verify', {
      method: 'POST',
      body: JSON.stringify({ email: newEmail, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.detail === 'string' ? data.detail : 'Неверный код');
    }
    await applyTokens(data);
    return data;
  };

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    clearStoredTokens();
    clearChatState();
    setAuthStatus({ authorized: false, profile: null });
    setTransactions([]);
  };

  const createTopup = async (amountRub) => {
    const res = await apiFetch('/billing/topup', {
      method: 'POST',
      body: JSON.stringify({ amount_rub: amountRub }),
    });
    if (!res.ok) throw new Error('Не удалось создать счёт');
    return res.json();
  };

  const checkTopup = async (invoiceId) => {
    const res = await apiFetch(
      `/billing/topup/check?invoice_id=${encodeURIComponent(invoiceId)}`
    );
    if (!res.ok) throw new Error('Ошибка проверки оплаты');
    const data = await res.json();
    if (data.status === 'paid') {
      await fetchProfile();
      await fetchTransactions();
    }
    return data;
  };

  const redeemPromoCode = async (code) => {
    const res = await apiFetch('/billing/promo/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: code.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.detail === 'string' ? data.detail : 'Промокод не принят');
    }
    if (data.status === 'success' || data.action === 'grant_tier') {
      await fetchProfile();
      await fetchTransactions();
    }
    return data;
  };

  const subscribeToTier = async (tier) => {
    let promoCode = '';
    try {
      promoCode = sessionStorage.getItem('nexus_promo_discount') || '';
    } catch {
      promoCode = '';
    }
    let res;
    try {
      res = await apiFetch('/billing/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          tier,
          ...(promoCode ? { promo_code: promoCode } : {}),
        }),
      });
    } catch {
      throw new Error('Нет связи с Nexus. Проверьте интернет и повторите попытку через минуту.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось оформить подписку');
    }
    if (data.immediate || data.status === 'paid' || data.status === 'success') {
      try {
        sessionStorage.removeItem('nexus_promo_discount');
      } catch {
        /* ignore */
      }
      await fetchProfile();
      await fetchTransactions();
    }
    return data;
  };

  const checkSubscription = async (invoiceId) => {
    const res = await apiFetch(
      `/billing/subscribe/check?invoice_id=${encodeURIComponent(invoiceId)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.detail === 'string' ? data.detail : 'Ошибка подтверждения оплаты');
    }
    await fetchProfile();
    await fetchTransactions();
    return data;
  };

  const repairPolzaKey = async () => {
    const res = await apiFetch('/auth/repair-polza', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.detail === 'string' ? data.detail : 'Не удалось восстановить ключ ИИ'
      );
    }
    await fetchProfile();
    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        authStatus,
        loading,
        balance: normalizeBalance(
          authStatus.profile?.balance_rub ??
            (authStatus.profile?.balance_usd ?? authStatus.profile?.balance ?? 0) *
              (authStatus.profile?.usd_rub_rate || 0)
        ),
        balanceRub: normalizeBalance(authStatus.profile?.balance_rub),
        balanceUsd: normalizeBalance(
          authStatus.profile?.balance_usd ?? authStatus.profile?.balance
        ),
        usdRubRate: authStatus.profile?.usd_rub_rate ?? null,
        transactions,
        txLoading,
        logout,
        fetchProfile,
        fetchTransactions,
        createTopup,
        checkTopup,
        subscribeToTier,
        redeemPromoCode,
        checkSubscription,
        repairPolzaKey,
        authModalOpen,
        openAuthModal,
        closeAuthModal,
        requestEmailCode,
        verifyEmailCode,
        startGoogleLogin,
        completeGoogleExchange,
        completeTelegramExchange,
        linkTelegramFromExchange,
        completeTelegramLogin,
        requestBindEmail,
        verifyBindEmail,
        googleOAuthAvailable,
        emailAuthEnabled,
        telegramAuthEnabled,
        telegramBotUsername,
        telegramLoginDomain,
        authConfigLoaded,
        authConfig,
        loadAuthConfig,
        settingsOpen,
        settingsSection,
        setSettingsSection,
        openSettingsModal,
        closeSettingsModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
