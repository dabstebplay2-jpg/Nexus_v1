import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { setTestingTier } from '../../lib/testingMode';
import { findModelById } from '../../lib/chatApi';
import { getRecentModelIds, pushRecentModel } from '../../lib/modelRecents';
import { useAuth } from '../../context/AuthContext';

const TIERS = ['FREE', 'HOBBY', 'STANDARD', 'PRO', 'ULTRA'];

export default function TestingControls({
  currentTier = 'ULTRA',
  models = [],
  selectedModel,
  onModelChange,
  onTierChanged,
}) {
  const { subscribeToTier, checkSubscription } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recents = getRecentModelIds()
    .map((id) => findModelById(models, id))
    .filter(Boolean);

  const handleTier = async (tier) => {
    if (busy || tier === currentTier) return;
    setBusy(true);
    setError('');
    try {
      await setTestingTier(tier, { subscribeToTier, checkSubscription });
      await onTierChanged?.();
    } catch (e) {
      setError(e.message || 'Не удалось сменить тестовый тариф');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
        <FlaskConical size={12} />
        Тест
      </span>
      <select
        value={currentTier}
        disabled={busy}
        onChange={(e) => handleTier(e.target.value)}
        className="bg-[var(--nx-surface)] border border-[var(--nx-border)] rounded-lg px-2 py-1 text-[var(--nx-text)] outline-none"
        title="Симуляция тарифа (все модели всё равно открыты)"
      >
        {TIERS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {recents.length > 0 && (
        <div className="flex flex-wrap gap-1 max-w-md">
          {recents.slice(0, 5).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                pushRecentModel(m.id);
                onModelChange?.(m.id);
              }}
              className={`px-2 py-0.5 rounded-full border truncate max-w-[140px] ${
                selectedModel === m.id
                  ? 'border-teal-500/50 bg-teal-500/20 text-teal-200'
                  : 'border-[var(--nx-border)] hover:bg-[var(--nx-surface-hover)] text-[var(--nx-muted)]'
              }`}
              title={m.display_name || m.name}
            >
              {(m.display_name || m.name || m.id).split('/').pop()}
            </button>
          ))}
        </div>
      )}
      {error ? <span className="text-red-300" role="alert">{error}</span> : null}
    </div>
  );
}
