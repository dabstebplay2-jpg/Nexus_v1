import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Settings,
  User,
  CreditCard,
  Gauge,
  Receipt,
  HelpCircle,
  Brain,
  Plug,
  Puzzle,
  LogOut,
  ExternalLink,
  RefreshCw,
  ArrowUpCircle,
  Coins,
  Send,
  Copy,
  Check,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import { getAppearance, setAppearance } from '../../lib/theme';
import { formatBalanceRub } from '../../lib/formatBalance';
import { usePricingCatalog, tierByIdFromList } from '../../hooks/usePricingCatalog';
import DailyLimitBar from '../DailyLimitBar';
import { useUsageStats } from '../../hooks/useUsageStats';
import { LEGAL } from '../../config/legal';
import { getDiscordHref, DISCORD_SERVER_NAME } from '../../config/community';
import { DiscordGlyph } from '../DiscordInviteLink';
import SectionMemory from './SectionMemory';
import ConnectorsPageContent from '../../features/connectors/ConnectorsPage';
import { fetchModels } from '../../lib/chatApi';
import {
  modelLockHint,
  pickDefaultMediaModel,
  sortModelsUnlockedFirst,
} from '../../lib/modelCatalogHelpers';
import './SettingsModal.css';

const SECTIONS = [
  { id: 'general', label: 'Общее', icon: Settings },
  { id: 'memory', label: 'Память', icon: Brain },
  { id: 'connectors', label: 'Коннекторы', icon: Plug },
  { id: 'account', label: 'Аккаунт', icon: User },
  { id: 'subscription', label: 'Подписка', icon: CreditCard },
  { id: 'usage', label: 'Использование', icon: Gauge },
  { id: 'billing', label: 'Платежи', icon: Receipt },
  { id: 'help', label: 'Справка', icon: HelpCircle },
];

const HELP_LINKS = [
  { label: 'Тарифы и оплата', to: '/pricing' },
  { label: 'IDE Web', to: '/ide/lite' },
  { label: 'Скачать Browser', to: '/browser' },
  { label: 'Скачать IDE', to: '/ide' },
  { label: 'Реквизиты', to: '/requisites' },
  { label: 'Изменения', to: '/updates' },
  { label: 'Оферта', to: '/offer' },
  { label: 'Конфиденциальность', to: '/privacy' },
];

function SettingsRow({ label, desc, children }) {
  return (
    <div className="settings-row">
      <div>
        <span className="settings-row__label">{label}</span>
        {desc ? <span className="settings-row__desc">{desc}</span> : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

function SectionGeneral() {
  const [appearance, setAppearanceState] = useState(getAppearance);
  const [mediaModels, setMediaModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [defaultMediaModel, setDefaultMediaModel] = useState(() => {
    return localStorage.getItem('nexus_default_media_model') || '';
  });

  const sortedMedia = sortModelsUnlockedFirst(mediaModels);
  const unlockedMedia = sortedMedia.filter((m) => !m.locked);
  const lockedMedia = sortedMedia.filter((m) => m.locked);
  const selectedMedia = sortedMedia.find((m) => m.id === defaultMediaModel);
  const selectedLocked = Boolean(selectedMedia?.locked);

  useEffect(() => {
    const onTheme = () => setAppearanceState(getAppearance());
    window.addEventListener('nexus-appearance-changed', onTheme);
    return () => window.removeEventListener('nexus-appearance-changed', onTheme);
  }, []);

  useEffect(() => {
    setModelsLoading(true);
    fetchModels()
      .then((data) => {
        const list = Array.isArray(data?.mediaModels) ? data.mediaModels : [];
        setMediaModels(list);
        const stored = localStorage.getItem('nexus_default_media_model') || '';
        const resolved = pickDefaultMediaModel(list, stored);
        if (resolved) {
          if (resolved !== stored) {
            localStorage.setItem('nexus_default_media_model', resolved);
          }
          setDefaultMediaModel(resolved);
        }
      })
      .catch((err) => console.error('Failed to load media models in settings:', err))
      .finally(() => setModelsLoading(false));
  }, []);

  const applyDefaultMedia = (modelId) => {
    const model = mediaModels.find((m) => m.id === modelId);
    if (!model || model.locked) return;
    localStorage.setItem('nexus_default_media_model', modelId);
    setDefaultMediaModel(modelId);
    window.dispatchEvent(new Event('nexus-default-media-model-changed'));
  };

  return (
    <>
      <SettingsRow label="Тема" desc="Как выглядит интерфейс Nexus на этом устройстве">
        <select
          className="settings-select"
          value={appearance}
          onChange={(e) => {
            setAppearance(e.target.value);
            setAppearanceState(e.target.value);
          }}
        >
          <option value="system">Системная</option>
          <option value="dark">Тёмная</option>
          <option value="light">Светлая</option>
        </select>
      </SettingsRow>

      <SettingsRow
        label="Модель генерации фото по умолчанию"
        desc="Используется при автоматическом распознавании команд генерации изображений в чате"
      >
        <div className="settings-media-model">
          <select
            className="settings-select settings-select--wide"
            value={defaultMediaModel}
            onChange={(e) => applyDefaultMedia(e.target.value)}
            disabled={modelsLoading || unlockedMedia.length === 0}
          >
            {modelsLoading ? (
              <option value="">Загрузка моделей…</option>
            ) : unlockedMedia.length === 0 ? (
              <option value="">Нет доступных моделей на тарифе</option>
            ) : (
              <>
                {unlockedMedia.length > 0 && lockedMedia.length > 0 ? (
                  <optgroup label="Доступные на вашем тарифе">
                    {unlockedMedia.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name || m.name || m.id}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  unlockedMedia.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.name || m.id}
                    </option>
                  ))
                )}
                {lockedMedia.length > 0 && (
                  <optgroup label="Требуют другую подписку">
                    {lockedMedia.map((m) => (
                      <option key={m.id} value={m.id} disabled>
                        {m.display_name || m.name || m.id} — {modelLockHint(m)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </>
            )}
          </select>
          {!modelsLoading && lockedMedia.length > 0 && (
            <p className="settings-media-model__hint">
              <Lock size={12} className="inline shrink-0 opacity-80" aria-hidden />
              {' '}
              Модели с замком недоступны на текущем тарифе — смените подписку в разделе «Подписка».
            </p>
          )}
          {selectedLocked && (
            <p className="settings-media-model__warn">
              Сохранённая модель недоступна — выберите модель из списка «Доступные».
            </p>
          )}
        </div>
      </SettingsRow>
    </>
  );
}

function EmailBindBlock({ profile, onBound }) {
  const { requestBindEmail, verifyBindEmail } = useAuth();
  const [step, setStep] = useState('idle');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!profile?.needs_real_email) return null;

  const requestCode = async () => {
    setBusy(true);
    setError('');
    try {
      await requestBindEmail(email);
      setStep('otp');
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setBusy(true);
    setError('');
    try {
      await verifyBindEmail(email, code);
      setStep('done');
      onBound?.();
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mb-3 space-y-2">
      <p className="text-sm text-amber-100/90">
        Добавьте email для оплаты тарифа и чеков ЮKassa.
      </p>
      {step === 'done' ? (
        <p className="text-sm text-emerald-400/90">Email привязан.</p>
      ) : step === 'otp' ? (
        <>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="Код из письма"
            className="w-full rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 py-2 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <button
            type="button"
            className="settings-btn settings-btn--primary"
            disabled={busy || code.length !== 6}
            onClick={confirmCode}
          >
            Подтвердить email
          </button>
        </>
      ) : (
        <>
          <input
            type="email"
            placeholder="email@example.com"
            className="w-full rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="button"
            className="settings-btn settings-btn--primary"
            disabled={busy || !email.includes('@')}
            onClick={requestCode}
          >
            Отправить код
          </button>
        </>
      )}
      {error ? <p className="text-xs text-red-400/90">{error}</p> : null}
    </div>
  );
}

function TelegramConnectBlock({ profile }) {
  const [linkData, setLinkData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const linked = Boolean(profile?.telegram_linked);
  const username = profile?.telegram_username;

  const requestLink = async () => {
    setLoading(true);
    setError('');
    setCopied(false);
    try {
      const res = await apiFetch('/telegram/link-token', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Не удалось получить ссылку');
      }
      setLinkData(data);
    } catch (e) {
      setError(e.message || 'Ошибка');
      setLinkData(null);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!linkData?.url) return;
    try {
      await navigator.clipboard.writeText(linkData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Не удалось скопировать ссылку');
    }
  };

  if (linked) {
    return (
      <SettingsRow
        label="Telegram"
        desc={username ? `@${username}` : 'Бот подключён к этому аккаунту'}
      >
        <span className="text-sm text-emerald-400/90">Подключён</span>
      </SettingsRow>
    );
  }

  return (
    <>
      <SettingsRow
        label="Telegram"
        desc="Привязка к вашему email-аккаунту. Команда /login в боте создаёт отдельный аккаунт — используйте эту кнопку."
      >
        <button
          type="button"
          className="settings-btn settings-btn--primary"
          onClick={requestLink}
          disabled={loading}
        >
          <Send size={16} />
          {loading ? 'Ссылка…' : 'Подключить Telegram'}
        </button>
      </SettingsRow>
      {error ? <p className="text-sm text-red-400/90 px-1 pb-2">{error}</p> : null}
      {linkData?.url ? (
        <div className="rounded-lg border border-[var(--nx-border)] p-3 mb-3 space-y-3">
          <p className="text-xs text-[var(--nx-muted)]">
            Откройте ссылку в Telegram (действует {Math.round((linkData.expires_in || 900) / 60)} мин.)
          </p>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(linkData.url)}`}
            alt="QR для привязки Telegram"
            width={160}
            height={160}
            className="mx-auto rounded-md bg-white p-1"
          />
          <p className="text-xs font-mono break-all text-[var(--nx-muted)]">{linkData.url}</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={linkData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="settings-btn settings-btn--primary"
            >
              <Send size={16} />
              Открыть в Telegram
            </a>
            <button type="button" className="settings-btn settings-btn--ghost" onClick={copyLink}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SectionAccount({ onClose }) {
  const { authStatus, logout, fetchProfile } = useAuth();
  const navigate = useNavigate();
  const p = authStatus.profile;
  const rawEmail = p?.email || '—';
  const email = p?.needs_real_email
    ? p?.telegram_username
      ? `@${p.telegram_username}`
      : 'Telegram-аккаунт'
    : rawEmail;
  const name = p?.needs_real_email
    ? p?.telegram_username || 'Пользователь'
    : rawEmail.split('@')[0] || 'Пользователь';

  const handleLogout = () => {
    onClose();
    logout();
    navigate('/');
  };

  const initial = name.trim().slice(0, 1).toUpperCase() || 'N';

  return (
    <>
      <div className="settings-account-summary">
        <span className="settings-account-summary__avatar" aria-hidden>{initial}</span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm text-[var(--nx-text)]">{name}</strong>
          <span className="mt-0.5 block truncate text-xs text-[var(--nx-muted)]">{email}</span>
        </div>
        <span className={`settings-account-summary__status ${p?.email_verified === false ? 'settings-account-summary__status--warn' : ''}`}>
          {p?.email_verified === false ? 'Нужно подтвердить' : 'Подтверждён'}
        </span>
      </div>
      <SettingsRow label="Имя в интерфейсе" desc="Отображается в боковой панели">
        <span className="text-sm text-[var(--nx-muted)]">{name}</span>
      </SettingsRow>
      <SettingsRow
        label="Email"
        desc={p?.needs_real_email ? 'Нужен для оплаты и чеков' : 'Для входа и уведомлений об оплате'}
      >
        <span className="text-sm font-mono text-[var(--nx-muted)]">{email}</span>
      </SettingsRow>
      <EmailBindBlock profile={p} onBound={() => fetchProfile()} />
      <SettingsRow
        label="Подтверждение email"
        desc={p?.email_verified !== false ? 'Адрес подтверждён' : 'Требуется подтверждение'}
      >
        <span className="text-sm text-emerald-400/90">
          {p?.email_verified !== false ? 'Да' : 'Нет'}
        </span>
      </SettingsRow>
      <TelegramConnectBlock profile={p} />
      <div className="pt-4 flex flex-wrap gap-2">
        <button type="button" className="settings-btn settings-btn--ghost" onClick={handleLogout}>
          <LogOut size={16} />
          Выйти
        </button>
      </div>
    </>
  );
}

function SectionSubscription({ onClose }) {
  const { authStatus } = useAuth();
  const navigate = useNavigate();
  const { tiers } = usePricingCatalog();
  const p = authStatus.profile;
  const tier = tierByIdFromList(tiers, p?.subscription_tier || 'FREE');

  const goPricing = () => {
    onClose();
    navigate('/pricing');
  };

  return (
    <>
      <div className="settings-plan-card">
        <p className="text-[11px] uppercase tracking-wide text-[var(--nx-muted)] mb-1">
          Текущий план
        </p>
        <p className="settings-plan-card__tier">{tier.name}</p>
        <p className="text-sm text-[var(--nx-muted)] mt-1">
          {tier.price > 0
            ? `${Math.round(tier.price).toLocaleString('ru-RU')} ₽ / месяц`
            : 'Бесплатно'}
        </p>
        <p className="text-xs text-[var(--nx-muted)] mt-2 leading-relaxed">
          {tier.aiAccess
            ? tier.desc || 'Облачный ИИ и пул использования по тарифу.'
            : 'Локальный IDE без облачного ИИ. Оформите подписку для чата с моделями.'}
        </p>
      </div>
      <p className="text-xs text-[var(--nx-muted)] mb-4 leading-relaxed">
        Сравнение всех тарифов и оплата через ЮKassa — на отдельной странице, чтобы настройки
        оставались компактными.
      </p>
      <div className="flex flex-col gap-2">
        <button type="button" className="settings-btn settings-btn--primary" onClick={goPricing}>
          <ArrowUpCircle size={16} />
          {tier.id === 'FREE' ? 'Выбрать тариф' : 'Изменить тариф'}
        </button>
        {authStatus.authorized && (
          <button
            type="button"
            className="settings-btn"
            onClick={() => {
              onClose();
              navigate('/pricing#topup');
            }}
          >
            <Coins size={16} />
            Пополнить баланс ИИ
          </button>
        )}
      </div>
    </>
  );
}

function formatTok(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString('ru-RU');
}

function formatPeriodEnd(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTransactionAmount(transaction) {
  const rub = Number(transaction?.amount_rub);
  if (Number.isFinite(rub)) {
    return formatBalanceRub(rub, { digits: Math.abs(rub) < 1 && rub !== 0 ? 2 : 0 });
  }
  const amount = Number(transaction?.amount);
  if (!Number.isFinite(amount)) return '—';
  return `$${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function SectionUsage() {
  const navigate = useNavigate();
  const { authStatus, repairPolzaKey, fetchProfile } = useAuth();
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairMsg, setRepairMsg] = useState('');
  const p = authStatus.profile;
  const topupRub = p?.topup_balance_rub ?? (p?.balance_rub ?? 0);
  const tier = (p?.subscription_tier || 'FREE').toUpperCase();
  const needsPolzaRepair = tier !== 'FREE' && !p?.has_polza_key;
  const hasPool = (p?.monthly_cap_rub ?? 0) > 0 || topupRub > 0;

  const handleRepairPolza = async () => {
    setRepairBusy(true);
    setRepairMsg('');
    try {
      await repairPolzaKey();
      setRepairMsg('Ключ ИИ восстановлен.');
      await fetchProfile();
    } catch (e) {
      setRepairMsg(e.message || 'Не удалось восстановить ключ');
    } finally {
      setRepairBusy(false);
    }
  };
  const { stats, loading, error, refresh } = useUsageStats({
    enabled: authStatus.authorized && hasPool,
  });

  return (
    <>
      {hasPool ? (
        <>
          <SettingsRow
            label="Пул ИИ на месяц"
            desc="Лимит подписки на 30 дней — ключ ИИ выдаётся Nexus автоматически после оплаты"
          >
            <span className="text-sm font-semibold tabular-nums">
              {formatBalanceRub(p.monthly_remaining_rub ?? 0)}
              <span className="text-[var(--nx-muted)] font-normal">
                {' '}
                / {formatBalanceRub(p.monthly_cap_rub ?? 0)}
              </span>
            </span>
          </SettingsRow>
          <SettingsRow
            label="Баланс пополнения"
            desc="Pay-As-You-Go — тратится после исчерпания пула подписки"
          >
            <span className="text-sm font-semibold tabular-nums text-emerald-400">
              {formatBalanceRub(topupRub)}
            </span>
          </SettingsRow>
          <SettingsRow
            label="Всего доступно"
            desc="Пул подписки + баланс пополнения"
          >
            <span className="text-sm font-semibold tabular-nums">
              {formatBalanceRub(p.total_remaining_rub ?? (p.monthly_remaining_rub ?? 0) + topupRub)}
            </span>
          </SettingsRow>
          {(p.monthly_remaining_rub ?? 0) <= 0 && topupRub <= 0 && (
            <button
              type="button"
              className="settings-btn settings-btn--primary w-full mt-2"
              onClick={() => navigate('/pricing#topup')}
            >
              <Coins size={16} />
              Пополнить баланс
            </button>
          )}
          {p.period_end && (
            <SettingsRow
              label={p.period_expired ? 'Период истёк' : 'Период до'}
              desc={
                p.period_expired
                  ? 'Продлите подписку в «Тарифы» или пополните баланс'
                  : 'Дата окончания 30-дневного пула подписки'
              }
            >
              <span
                className={`text-sm ${p.period_expired ? 'text-amber-400' : 'text-[var(--nx-muted)]'}`}
              >
                {formatPeriodEnd(p.period_end)}
              </span>
            </SettingsRow>
          )}
          <div className="mt-2 rounded-lg border border-[var(--nx-border)] p-3">
            <DailyLimitBar profile={p} />
          </div>

          {needsPolzaRepair && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs text-amber-200/90 leading-relaxed">
                Ключ облачного ИИ не привязан — чат может не отвечать после оплаты.
              </p>
              <button
                type="button"
                disabled={repairBusy}
                onClick={handleRepairPolza}
                className="settings-btn settings-btn--primary w-full"
              >
                {repairBusy ? 'Восстановление…' : 'Починить ключ ИИ'}
              </button>
              {repairMsg && <p className="text-xs text-[var(--nx-muted)]">{repairMsg}</p>}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-[var(--nx-text)]">Токены за период</p>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="text-xs text-cyan-400 hover:underline flex items-center gap-1 shrink-0"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Обновить
            </button>
          </div>
          {error && <p className="text-xs text-amber-500 mt-2">{error}</p>}
          {stats && (
            <>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-lg border border-[var(--nx-border)] p-3">
                  <p className="text-[10px] uppercase text-[var(--nx-muted)]">Вход</p>
                  <p className="text-lg font-semibold tabular-nums">{formatTok(stats.prompt_tokens)}</p>
                </div>
                <div className="rounded-lg border border-[var(--nx-border)] p-3">
                  <p className="text-[10px] uppercase text-[var(--nx-muted)]">Выход</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatTok(stats.completion_tokens)}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--nx-border)] p-3">
                  <p className="text-[10px] uppercase text-[var(--nx-muted)]">Запросов</p>
                  <p className="text-lg font-semibold tabular-nums">{formatTok(stats.request_count)}</p>
                </div>
                <div className="rounded-lg border border-[var(--nx-border)] p-3">
                  <p className="text-[10px] uppercase text-[var(--nx-muted)]">Из пула</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatBalanceRub(stats.spent_rub ?? 0)}
                  </p>
                </div>
              </div>
              {stats.by_model?.length > 0 && (
                <div className="mt-4 overflow-x-auto -mx-1 px-1">
                  <table className="w-full min-w-[280px] text-left text-xs">
                    <thead>
                      <tr className="text-[var(--nx-muted)] border-b border-[var(--nx-border)]">
                        <th className="py-2 pr-2 font-medium">Модель</th>
                        <th className="py-2 px-2 font-medium text-right">In</th>
                        <th className="py-2 px-2 font-medium text-right">Out</th>
                        <th className="py-2 pl-2 font-medium text-right">Запросы</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.by_model.map((row) => (
                        <tr key={row.model} className="border-b border-[var(--nx-border)]/60">
                          <td className="py-2 pr-2 font-mono text-[11px] truncate max-w-[140px]">
                            {row.model}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {formatTok(row.prompt_tokens)}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {formatTok(row.completion_tokens)}
                          </td>
                          <td className="py-2 pl-2 text-right tabular-nums">{row.requests}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {loading && !stats && (
            <p className="text-xs text-[var(--nx-muted)] mt-2">Загрузка статистики…</p>
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--nx-muted)] py-2 leading-relaxed">
          На тарифе Free облачный ИИ недоступен. Оформите подписку в разделе «Подписка».
        </p>
      )}
    </>
  );
}

function SectionBilling() {
  const { transactions, txLoading, fetchTransactions } = useAuth();

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-[var(--nx-muted)]">Последние операции</p>
        <button
          type="button"
          onClick={fetchTransactions}
          disabled={txLoading}
          className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
        >
          <RefreshCw size={12} className={txLoading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>
      {txLoading && transactions.length === 0 ? (
        <div className="settings-tx-list" aria-label="Загрузка операций">
          {[0, 1, 2].map((item) => <div key={item} className="settings-tx-skeleton" />)}
        </div>
      ) : transactions.length === 0 ? (
        <div className="settings-empty">
          <Receipt size={22} />
          <strong>Операций пока нет</strong>
          <span>Здесь появятся оплаты тарифов, пополнения и расходы ИИ.</span>
        </div>
      ) : (
        <div className="settings-tx-list">
          {transactions.slice(0, 12).map((tx, i) => (
            <div key={i} className="settings-tx-item">
              <div className="min-w-0">
                <p className="truncate text-[var(--nx-text)]">
                  {tx.description || tx.tx_type || 'Операция'}
                </p>
                <p className="text-[10px] text-[var(--nx-muted)]">
                  {tx.created_at ? new Date(tx.created_at).toLocaleString('ru-RU') : ''}
                </p>
              </div>
              <span
                className={`font-mono shrink-0 ${
                  Number(tx.amount_rub ?? tx.amount) < 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {formatTransactionAmount(tx)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SectionHelp({ onClose }) {
  const navigate = useNavigate();

  return (
    <>
      <p className="text-sm text-[var(--nx-muted)] mb-3">
        Обращения с фото и перепиской — в чате (кнопка «Поддержка» у поля ввода) или по email{' '}
        <a href={`mailto:${LEGAL.email}`} className="text-cyan-400 hover:underline">
          {LEGAL.email}
        </a>
        .
      </p>
      <button
        type="button"
        className="settings-btn settings-btn--primary w-full justify-center mb-3"
        onClick={() => {
          onClose();
          window.dispatchEvent(new CustomEvent('nexus-open-support'));
        }}
      >
        <HelpCircle size={16} />
        Открыть поддержку
      </button>
      <a
        href={getDiscordHref()}
        target="_blank"
        rel="noopener noreferrer"
        className="settings-btn settings-btn--ghost w-full justify-center mb-4 border border-indigo-500/25 text-indigo-200 hover:bg-indigo-500/10"
        onClick={onClose}
      >
        <DiscordGlyph className="h-4 w-4" />
        Discord · {DISCORD_SERVER_NAME}
      </a>
      <div className="settings-link-list">
        {HELP_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="settings-link"
            onClick={onClose}
          >
            {item.label}
            <ExternalLink size={14} className="opacity-40" />
          </Link>
        ))}
      </div>
      <div className="mt-6 pt-4 border-t border-[var(--nx-border)]">
        <button
          type="button"
          className="settings-btn settings-btn--ghost w-full justify-center"
          onClick={() => {
            onClose();
            navigate('/ide');
          }}
        >
          <Puzzle size={16} />
          Расширение для IDE
        </button>
      </div>
    </>
  );
}

function SectionContent({ section, onClose }) {
  switch (section) {
    case 'general':
      return <SectionGeneral />;
    case 'memory':
      return <SectionMemory />;
    case 'connectors':
      return (
        <div className="settings-connectors -mx-1 pr-1">
          <ConnectorsPageContent compact />
        </div>
      );
    case 'account':
      return <SectionAccount onClose={onClose} />;
    case 'subscription':
      return <SectionSubscription onClose={onClose} />;
    case 'usage':
      return <SectionUsage />;
    case 'billing':
      return <SectionBilling />;
    case 'help':
      return <SectionHelp onClose={onClose} />;
    default:
      return <SectionGeneral />;
  }
}

export default function SettingsModal() {
  const { settingsOpen, settingsSection, setSettingsSection, closeSettingsModal } = useAuth();
  const sectionMeta = SECTIONS.find((s) => s.id === settingsSection) || SECTIONS[0];
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!settingsOpen) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => dialog?.focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSettingsModal();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => node.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [settingsOpen, closeSettingsModal]);

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          className="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeSettingsModal}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            tabIndex={-1}
            className="settings-dialog"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-body">
              <nav className="settings-nav" aria-label="Разделы настроек">
                {SECTIONS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`settings-nav-btn ${
                      settingsSection === id ? 'settings-nav-btn--active' : ''
                    }`}
                    onClick={() => setSettingsSection(id)}
                  >
                    <Icon size={17} strokeWidth={1.75} />
                    {label}
                  </button>
                ))}
              </nav>

              <div className="settings-main">
                <header className="settings-header">
                  <h2 id="settings-title" className="settings-title">
                    {sectionMeta.label}
                  </h2>
                  <button
                    type="button"
                    className="settings-close"
                    onClick={closeSettingsModal}
                    aria-label="Закрыть"
                  >
                    <X size={20} />
                  </button>
                </header>
                <div className="settings-content">
                  <SectionContent section={settingsSection} onClose={closeSettingsModal} />
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
