import { motion } from 'framer-motion';
import { formatBalanceRub } from '../lib/formatBalance';

/** Полоса месячного пула ИИ (отображение в ₽) */
export default function DailyLimitBar({ profile, compact = false, className = '' }) {
  const rate = profile?.usd_rub_rate || 95;
  const capRub = profile?.monthly_cap_rub ?? profile?.monthly_quota_rub;
  const capUsd = profile?.monthly_cap_usd ?? profile?.monthly_quota_usd;
  const subCap =
    capRub && capRub > 0 ? capRub : capUsd && capUsd > 0 ? capUsd * rate : 0;
  const topupRub =
    profile?.topup_balance_rub ??
    (profile?.topup_balance_usd ?? profile?.balance_usd ?? profile?.balance ?? 0) * rate;
  const totalCap = subCap + (topupRub > 0 ? topupRub : 0);
  if (!totalCap || totalCap <= 0) return null;

  const spentRub = profile?.monthly_spent_rub ?? (profile?.monthly_spent_usd ?? 0) * rate;
  const subRemainingRub =
    profile?.monthly_remaining_rub ?? Math.max(0, subCap - spentRub);
  const totalRemainingRub =
    profile?.total_remaining_rub ?? subRemainingRub + (topupRub > 0 ? topupRub : 0);
  const pct =
    profile?.monthly_used_percent ??
    (subCap > 0 ? Math.min(100, (spentRub / subCap) * 100) : 0);

  const periodEnd = profile?.period_end;
  const periodExpired = profile?.period_expired;

  const barColor =
    pct >= 95 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-cyan-500';

  return (
    <div className={`${className}`}>
      {!compact && (
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-zinc-500">Пул ИИ на месяц</span>
          <span className="text-zinc-400 font-mono">
            {formatBalanceRub(spentRub)} / {formatBalanceRub(subCap)}
            <span className="text-zinc-600 ml-1">(ост. {formatBalanceRub(totalRemainingRub)})</span>
            {topupRub > 0 && (
              <span className="text-emerald-500/80 ml-1">+{formatBalanceRub(topupRub)} баланс</span>
            )}
          </span>
        </div>
      )}
      <div className={`w-full rounded-full bg-white/10 overflow-hidden ${compact ? 'h-1' : 'h-2'}`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 0.4 }}
          className={`h-full ${barColor}`}
        />
      </div>
      {compact ? (
        <span className="text-[10px] text-zinc-600 mt-0.5 block">
          Месяц: {pct.toFixed(0)}%
          {periodEnd ? ` · до ${periodEnd}` : ''}
        </span>
      ) : (
        <p className="text-[10px] text-zinc-600 mt-1">
          Пул подписки на 30 дней{topupRub > 0 ? ' + баланс пополнения' : ''}.
          {periodExpired
            ? ' Период закончился — продлите тариф в «Тарифы».'
            : periodEnd
              ? ` Действует до ${periodEnd}.`
              : ''}
          {subRemainingRub <= 0 && topupRub > 0 ? ' Сейчас тратится баланс пополнения.' : ''}
        </p>
      )}
    </div>
  );
}
