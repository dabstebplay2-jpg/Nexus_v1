import { Check, Loader2, Lock, Plug } from 'lucide-react';
import { connectorInitial, iconStyle } from './connectorIcons';
import { tierLabel } from './connectorTierLabels';

const TIER_CTA = {
  FREE: 'Hobby',
  HOBBY: 'Hobby',
  STANDARD: 'Standard',
  PRO: 'Pro',
  ULTRA: 'Ultra',
};

export default function ConnectorCard({
  connector,
  busy,
  onConnect,
  onDisconnect,
  onToggleChat,
  onUpgrade,
}) {
  const {
    id,
    name,
    description,
    icon,
    connected,
    available,
    coming_soon,
    blocked_reason,
    required_tier,
    account_label,
    enabled_for_chat,
  } = connector;

  const tierBlocked = blocked_reason === 'tier';
  const oauthBlocked = blocked_reason === 'oauth_not_configured';
  const soon = coming_soon || blocked_reason === 'coming_soon';
  const canConnect = available && !connected;
  const cardActionable = canConnect || tierBlocked;

  const handleCardClick = () => {
    if (busy || connected || soon || oauthBlocked) return;
    if (tierBlocked) {
      onUpgrade?.(required_tier);
      return;
    }
    if (canConnect) onConnect?.(id);
  };

  const handleCardKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    handleCardClick();
  };

  const requiredLabel = tierLabel(required_tier || 'HOBBY');
  const upgradeTier = TIER_CTA[(required_tier || 'HOBBY').toUpperCase()] || requiredLabel;

  return (
    <article
      role={cardActionable ? 'button' : undefined}
      tabIndex={cardActionable ? 0 : undefined}
      onClick={cardActionable ? handleCardClick : undefined}
      onKeyDown={cardActionable ? handleCardKeyDown : undefined}
      className={`relative flex flex-col rounded-xl border p-4 min-h-[140px] transition-colors ${
        connected
          ? 'border-teal-500/40 bg-teal-500/5'
          : 'border-white/10 bg-white/[0.03] hover:border-white/15'
      } ${soon ? 'opacity-70' : ''} ${cardActionable ? 'cursor-pointer' : ''}`}
    >
      {connected && (
        <span className="absolute top-3 right-3 text-teal-400" title="Подключено">
          <Check size={18} />
        </span>
      )}
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${iconStyle(icon)}`}
        >
          {connectorInitial(name)}
        </div>
        <div className="min-w-0 pr-6">
          <h3 className="font-semibold text-white text-sm leading-tight">{name}</h3>
          {connected && account_label && (
            <p className="text-xs text-teal-300/90 mt-0.5 truncate">{account_label}</p>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500 line-clamp-3 flex-1">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {soon && (
          <>
            <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 text-zinc-500">Скоро</span>
            <span className="text-[11px] text-zinc-600">В разработке</span>
          </>
        )}
        {oauthBlocked && !connected && (
          <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-200/80">
            Настройка на сервере
          </span>
        )}
        {tierBlocked && !connected && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onUpgrade?.(required_tier)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
          >
            <Lock size={14} />
            Нужен тариф {upgradeTier}
          </button>
        )}
        {canConnect && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onConnect?.(id)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600/90 hover:bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
            Подключить
          </button>
        )}
        {connected && (
          <>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(enabled_for_chat)}
                onChange={(e) => onToggleChat?.(id, e.target.checked)}
                className="rounded border-white/20"
              />
              В чате
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDisconnect?.(id)}
              className="text-xs text-zinc-500 hover:text-red-400"
            >
              Отключить
            </button>
          </>
        )}
      </div>
    </article>
  );
}
