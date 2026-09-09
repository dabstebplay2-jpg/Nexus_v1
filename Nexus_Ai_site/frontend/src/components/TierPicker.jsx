import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePricingCatalog, tierByIdFromList } from '../hooks/usePricingCatalog';
import { formatBalanceRub, formatUsdRubRate } from '../lib/formatBalance';
import PromoCodeBox from './PromoCodeBox';

const BILLING_TEST_MODE = import.meta.env.VITE_BILLING_TEST_MODE === 'true';

/**
 * Кликабельные карточки тарифов (цены в ₽, курс ЦБ).
 */
export default function TierPicker({
  mode = 'subscribe',
  selectedTierId,
  onSelectTier,
  currentTierId,
  layout = 'stack',
  compact = false,
  onSuccess,
}) {
  const { authStatus, subscribeToTier, checkSubscription, checkTopup, fetchProfile } = useAuth();
  const { tiers, usdRub, rateMeta, promoEnabled, promoHints, loading: catalogLoading, reload } =
    usePricingCatalog();
  const [pendingTier, setPendingTier] = useState(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inv =
      params.get('invoice_id') || sessionStorage.getItem('nexus_pending_invoice');
    const isPaymentReturn =
      params.get('payment') === 'success' || Boolean(inv);

    if (!authStatus.authorized) {
      if (isPaymentReturn && inv) {
        sessionStorage.setItem('nexus_pending_invoice', inv);
        setMessage('Оплата получена. Войдите в аккаунт, чтобы активировать тариф.');
      }
      return;
    }

    if (mode !== 'subscribe' && !isPaymentReturn) return;
    if (!isPaymentReturn || !inv) return;
    // topup_* обрабатывает PricingPage
    if (inv.startsWith('topup_')) return;

    let cancelled = false;
    (async () => {
      setBusy(true);
      setMessage('Проверяем оплату…');
      try {
        const isTopup = inv.startsWith('topup_');
        const data = isTopup ? await checkTopup(inv) : await checkSubscription(inv);
        if (cancelled) return;
        const q = data.pool_rub ?? data.monthly_quota_rub;
        const polzaNote = data.polza_warning ? ` ${data.polza_warning}` : '';
        setMessage(
          isTopup
            ? `Баланс успешно пополнен на ${formatBalanceRub(q)}!${polzaNote}`
            : `Оплачено! Тариф ${data.tier}${
                q
                  ? ` — пул ИИ ${formatBalanceRub(q)} на 30 дней`
                  : ''
              }${polzaNote}`
        );
        setInvoiceId('');
        setPaymentUrl('');
        setPendingTier(null);
        sessionStorage.removeItem('nexus_pending_invoice');
        await fetchProfile();
        onSuccess?.(data);
        const url = new URL(window.location.href);
        url.searchParams.delete('payment');
        url.searchParams.delete('invoice_id');
        window.history.replaceState({}, '', url.pathname + url.search);
      } catch (err) {
        if (!cancelled) {
          setInvoiceId(inv);
          setMessage(err.message || 'Оплата ещё обрабатывается. Нажмите «Проверить оплату».');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, authStatus.authorized, checkSubscription, checkTopup, fetchProfile, onSuccess]);

  const effectiveCurrent =
    currentTierId || authStatus.profile?.subscription_tier || selectedTierId || 'FREE';

  const handleCardClick = (tierId) => {
    if (mode === 'select' && onSelectTier) {
      onSelectTier(tierId);
      return;
    }
    if (mode === 'subscribe' && !authStatus.authorized) {
      setMessage('Сначала войдите во вкладку «Аккаунт».');
      return;
    }
    if (mode === 'select') return;
    setPendingTier(tierId);
    setMessage('');
    setInvoiceId('');
    setPaymentUrl('');
  };

  const handleAction = async (tierId, e) => {
    e?.stopPropagation();
    if (mode === 'select') {
      onSelectTier?.(tierId);
      return;
    }
    if (!authStatus.authorized) {
      setMessage('Войдите в аккаунт, чтобы оформить подписку.');
      return;
    }
    if (authStatus.profile?.needs_real_email) {
      setMessage('Добавьте email в Настройках → Аккаунт перед оплатой тарифа.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const data = await subscribeToTier(tierId);
      if (data.status === 'already') {
        setMessage(data.message || 'Тариф уже активен.');
        return;
      }
      if (data.immediate || data.status === 'success') {
        setMessage(data.message || `Тариф ${tierId} активирован.`);
        setPendingTier(null);
        setInvoiceId('');
        await fetchProfile();
        onSuccess?.(data);
        return;
      }
      if (data.payment_url) {
        sessionStorage.setItem('nexus_pending_invoice', data.invoice_id);
        window.location.href = data.payment_url;
        return;
      }
      if (data.invoice_id) {
        setInvoiceId(data.invoice_id);
        setPaymentUrl(data.payment_url || '');
        setPendingTier(tierId);
        setMessage(
          data.message ||
            (BILLING_TEST_MODE
              ? `Счёт ${formatBalanceRub(data.amount_rub)}. Подтвердите оплату (тест).`
              : `Счёт ${formatBalanceRub(data.amount_rub)}. Оплата через ЮKassa.`)
        );
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmPay = async (e) => {
    e?.stopPropagation();
    if (!invoiceId) return;
    setBusy(true);
    try {
      const isTopup = invoiceId.startsWith('topup_');
      const data = isTopup ? await checkTopup(invoiceId) : await checkSubscription(invoiceId);
      const q = data.pool_rub ?? data.monthly_quota_rub;
      const qStr = q ? formatBalanceRub(q) : 'см. профиль';
      setMessage(
        isTopup
          ? `Баланс успешно пополнен на ${qStr}!`
          : `Оплачено! Тариф ${data.tier} — пул ИИ ${qStr} на 30 дней`
      );
      setInvoiceId('');
      setPendingTier(null);
      await fetchProfile();
      onSuccess?.(data);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const isGrid = layout === 'grid';
  const gridClass = isGrid
    ? 'flex overflow-x-auto snap-x snap-mandatory gap-4 px-4 pb-4 -mx-4 scrollbar-none sm:grid sm:gap-4 sm:px-0 sm:mx-0 sm:pb-0 sm:grid-cols-2 lg:grid-cols-3 items-stretch'
    : 'flex flex-col gap-3';
  const cardPad = isGrid ? 'p-5' : compact ? 'p-3' : 'p-4';

  return (
    <div className="space-y-3">
      {mode === 'subscribe' && promoEnabled && (
        <PromoCodeBox
          promoHints={promoHints}
          enabled={promoEnabled}
          onRedeemed={() => {
            reload();
            onSuccess?.();
          }}
        />
      )}

      {usdRub && (
        <p className="text-[11px] text-center text-[var(--nx-muted)] leading-relaxed">
          Официальный курс ЦБ РФ
          {rateMeta.rateDate
            ? ` на ${rateMeta.rateDate.split('-').reverse().join('.')}`
            : ''}
          : {formatUsdRubRate(usdRub)}. Цены в ₽ пересчитываются при каждом открытии тарифов.
          {rateMeta.source === 'fallback' ? ' (резервный курс — ЦБ временно недоступен)' : ''}
        </p>
      )}
      <div className={gridClass}>
        {tiers.map((t) => {
          const isCurrent = effectiveCurrent === t.id;
          const isSelected =
            mode === 'select' ? selectedTierId === t.id : pendingTier === t.id;
          const isActive = isCurrent || isSelected;

          return (
            <motion.div
              key={t.id}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleCardClick(t.id)}
              whileHover={isGrid ? undefined : { scale: 1.02 }}
              whileTap={isGrid ? undefined : { scale: 0.98 }}
              onClick={() => handleCardClick(t.id)}
              className={`flex flex-col h-full min-h-0 text-left rounded-xl border transition-all w-full cursor-pointer ${cardPad} ${
                isActive
                  ? 'border-cyan-500/60 bg-cyan-500/10 ring-1 ring-cyan-500/40'
                  : t.popular
                    ? 'border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-500/50'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
              } ${isGrid ? 'hover:border-cyan-500/40 snap-start shrink-0 w-[300px] sm:w-auto' : ''}`}
            >
              <div className="flex justify-between items-start gap-2 shrink-0">
                <div className="min-w-0">
                  <h3 className={`font-bold text-white ${isGrid ? 'text-base' : compact ? 'text-sm' : 'text-base'}`}>
                    {t.name}
                  </h3>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {t.popular && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-cyan-400 font-semibold">
                        <Sparkles size={10} /> Популярный
                      </span>
                    )}
                    {t.marketBadge && (
                      <span className="inline-block text-[10px] font-medium text-violet-300/90 bg-violet-500/10 px-1.5 py-0.5 rounded">
                        {t.marketBadge}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-cyan-400 font-bold shrink-0 text-right ${
                    isGrid ? 'text-sm' : ''
                  }`}
                >
                  {t.price === 0 ? '0 ₽' : formatBalanceRub(t.price)}
                  <span className="text-[10px] text-zinc-500 font-normal block">/мес</span>
                </span>
              </div>

              <div className="flex-1 flex flex-col min-h-0 mt-2">
                {t.aiAccess ? (
                  <p
                    className={`text-xs leading-relaxed text-emerald-400/95 ${
                      isGrid ? 'min-h-[2.75rem]' : 'min-h-[2.25rem]'
                    }`}
                    title={
                      t.quotaHint
                        ? `Пул ИИ ~${Math.round(t.poolSharePercent || 93)}% · ${t.quotaHint}`
                        : undefined
                    }
                  >
                    ИИ-пул {formatBalanceRub(t.monthlyQuotaRub ?? t.monthly_cap_rub)}
                    {t.poolSharePercent ? ` (~${Math.round(t.poolSharePercent)}%)` : ''}
                  </p>
                ) : (
                  <p
                    className={`text-[11px] text-zinc-500 ${
                      isGrid ? 'min-h-[2.5rem]' : ''
                    }`}
                  >
                    Только локальный IDE
                  </p>
                )}

                <ul
                  className={`mt-3 space-y-2 flex-1 ${
                    compact && !isGrid ? 'hidden sm:block' : ''
                  } ${isGrid ? 'min-h-[7.5rem]' : ''}`}
                >
                  {t.features.slice(0, isGrid ? 4 : compact ? 2 : 4).map((x) => (
                    <li key={x} className="flex gap-2 text-xs leading-relaxed text-zinc-400">
                      <Check size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto pt-4 shrink-0 border-t border-white/5">
                {mode === 'select' ? (
                  <span
                    className={`block w-full text-center text-xs font-semibold py-2 rounded-lg ${
                      isSelected ? 'bg-cyan-500 text-black' : 'bg-white/5 text-zinc-400'
                    }`}
                  >
                    {isSelected ? 'Выбран' : 'Выбрать'}
                  </span>
                ) : isCurrent ? (
                  <span className="block w-full text-center text-xs font-semibold py-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                    ✓ Текущий тариф
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy || catalogLoading}
                    onClick={(e) => handleAction(t.id, e)}
                    className={`w-full text-center text-xs font-bold py-2 min-h-[2.25rem] rounded-lg transition-colors ${
                      busy && pendingTier === t.id
                        ? 'bg-zinc-700 text-zinc-400'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90'
                    }`}
                  >
                    {busy && pendingTier === t.id ? (
                      <Loader2 size={14} className="inline animate-spin" />
                    ) : t.price === 0 ? (
                      'Перейти на Free'
                    ) : (
                      `Оформить · ${formatBalanceRub(t.price)}`
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {invoiceId && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2"
        >
          <p className="text-sm text-amber-200">
            Счёт: <code className="font-mono text-xs">{invoiceId}</code>
          </p>
          {BILLING_TEST_MODE ? (
            <>
              <p className="text-xs text-zinc-400">
                {tierByIdFromList(tiers, pendingTier)?.name}: только для разработки — симуляция оплаты.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmPay}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
              >
                {busy ? 'Обработка…' : '✓ Подтвердить оплату (тест)'}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-zinc-400">
                Если вы уже оплатили на странице ЮKassa, нажмите «Проверить оплату». Тариф и ИИ
                активируются после подтверждения.
              </p>
              {paymentUrl && (
                <a
                  href={paymentUrl}
                  className="block w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold text-center"
                >
                  Перейти к оплате
                </a>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmPay}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
              >
                {busy ? 'Проверка…' : 'Проверить оплату'}
              </button>
            </>
          )}
        </motion.div>
      )}

      {message && (
        <p className="text-sm text-center text-zinc-300 bg-white/5 rounded-lg py-2 px-3">{message}</p>
      )}
    </div>
  );
}
