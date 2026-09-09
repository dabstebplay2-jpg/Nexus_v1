import { useState } from 'react';
import { Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const SESSION_DISCOUNT_KEY = 'nexus_promo_discount';
const BILLING_TEST_MODE = import.meta.env.VITE_BILLING_TEST_MODE === 'true';

export function getStoredDiscountPromo() {
  try {
    return sessionStorage.getItem(SESSION_DISCOUNT_KEY) || '';
  } catch {
    return '';
  }
}

export function clearStoredDiscountPromo() {
  try {
    sessionStorage.removeItem(SESSION_DISCOUNT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Промокод: мгновенная выдача тарифа или скидка на следующую оплату.
 */
export default function PromoCodeBox({ promoHints = [], enabled = true, onRedeemed }) {
  const { authStatus, redeemPromoCode, openAuthModal } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [showHints, setShowHints] = useState(false);
  const [activeDiscount, setActiveDiscount] = useState(getStoredDiscountPromo);

  if (!enabled) return null;

  const handleApply = async (e) => {
    e.preventDefault();
    if (!authStatus.authorized) {
      openAuthModal();
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) return;

    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const data = await redeemPromoCode(trimmed);
      if (data.status === 'discount') {
        sessionStorage.setItem(SESSION_DISCOUNT_KEY, data.code);
        setActiveDiscount(data.code);
        setMsg(data.message || `Скидка ${data.discount_percent}% сохранена для оплаты тарифа.`);
      } else {
        setMsg(data.message || `Тариф ${data.tier} активирован.`);
        setCode('');
        onRedeemed?.(data);
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const applyHint = (hintCode) => {
    setCode(hintCode);
    setShowHints(true);
  };

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-200/90">
        <Tag size={16} className="shrink-0" />
        <span className="text-sm font-semibold">Промокод</span>
        <span className="text-[10px] text-amber-200/50 font-normal">
          {BILLING_TEST_MODE ? 'тест подписок' : 'скидка или бонус'}
        </span>
      </div>

      {activeDiscount && (
        <p className="text-xs text-emerald-400">
          Активна скидка: <strong>{activeDiscount}</strong> — применится при «Оформить».
          <button
            type="button"
            className="ml-2 text-zinc-400 hover:text-white underline"
            onClick={() => {
              clearStoredDiscountPromo();
              setActiveDiscount('');
            }}
          >
            сбросить
          </button>
        </p>
      )}

      <form onSubmit={handleApply} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="NEXUS-ULTRA"
          className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="shrink-0 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          {busy ? '…' : 'Применить'}
        </button>
      </form>

      {msg && <p className="text-xs text-emerald-400">{msg}</p>}
      {err && <p className="text-xs text-red-400">{err}</p>}

      {BILLING_TEST_MODE && promoHints.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHints((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
          >
            {showHints ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Тестовые коды
          </button>
          {showHints && (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 text-[11px] text-zinc-400">
              {promoHints.map((h) => (
                <li key={h.code}>
                  <button
                    type="button"
                    onClick={() => applyHint(h.code)}
                    className="text-left w-full rounded-md px-2 py-1 hover:bg-white/5 hover:text-cyan-300"
                  >
                    <span className="font-mono text-cyan-400/90">{h.code}</span>
                    <span className="block text-zinc-500">{h.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
