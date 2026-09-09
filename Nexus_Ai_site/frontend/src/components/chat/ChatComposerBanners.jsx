import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Wrench, AlertCircle } from 'lucide-react';
import { modelSupportsToolCalling } from '../../lib/modelToolCalling';
import { formatConnectorList } from '../../features/connectors/connectorLabels';
import ChatInlineAlert from './ChatInlineAlert';

const TOOLS_HINT_KEY = 'nexus-tools-hint-dismissed';

export function getLowQuotaWarning(profile, thresholdPct = 85) {
  const rate = profile?.usd_rub_rate || 95;
  const capRub =
    profile?.monthly_cap_rub ?? profile?.monthly_quota_rub ?? profile?.daily_cap_rub;
  const capUsd = profile?.monthly_cap_usd ?? profile?.daily_cap_usd;
  const subCap = capRub && capRub > 0 ? capRub : capUsd && capUsd > 0 ? capUsd * rate : 0;
  const topupRub =
    profile?.topup_balance_rub ??
    (profile?.topup_balance_usd ?? profile?.balance_usd ?? profile?.balance ?? 0) * rate;
  const totalCap = subCap + (topupRub > 0 ? topupRub : 0);
  if (!totalCap || totalCap <= 0) return null;

  const pct =
    profile?.monthly_used_percent ??
    profile?.daily_used_percent ??
    (subCap > 0
      ? Math.min(
          100,
          ((profile?.monthly_spent_rub ?? profile?.daily_spent_rub ?? 0) / subCap) * 100
        )
      : 0);

  const remaining =
    profile?.total_remaining_rub ??
    profile?.monthly_remaining_rub ??
    profile?.daily_remaining_rub;

  if (pct < thresholdPct && (remaining == null || remaining > 0)) return null;
  return { pct, remaining };
}

export default function ChatComposerBanners({
  profile,
  modelsError,
  onRetryModels,
  connectorsForChat = [],
  selectedModelMeta,
  onOpenSettingsConnectors,
}) {
  const lowQuota = getLowQuotaWarning(profile);
  const needsTools =
    connectorsForChat.length > 0 &&
    selectedModelMeta &&
    !modelSupportsToolCalling(selectedModelMeta);
  const [toolsDismissed, setToolsDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(TOOLS_HINT_KEY) === '1'
  );

  useEffect(() => {
    const onDismiss = () => setToolsDismissed(true);
    window.addEventListener('nexus-tools-hint-dismissed', onDismiss);
    return () => window.removeEventListener('nexus-tools-hint-dismissed', onDismiss);
  }, []);

  const showTools = needsTools && !toolsDismissed;
  const hasAny = Boolean(modelsError || lowQuota || showTools);

  if (!hasAny) return null;

  const dismissTools = () => {
    localStorage.setItem(TOOLS_HINT_KEY, '1');
    window.dispatchEvent(new Event('nexus-tools-hint-dismissed'));
    setToolsDismissed(true);
  };

  const openModels = () => {
    window.dispatchEvent(new Event('nexus-open-model-picker'));
  };

  return (
    <div className="px-4 sm:px-6 pb-2 space-y-2">
      <AnimatePresence mode="sync">
        {modelsError && (
          <ChatInlineAlert
            key="models-error"
            variant="error"
            icon={AlertCircle}
            actions={
              onRetryModels ? (
                <button type="button" onClick={onRetryModels} className="font-semibold underline">
                  Повторить
                </button>
              ) : null
            }
          >
            <span>Не удалось загрузить модели.</span>
          </ChatInlineAlert>
        )}
        {lowQuota && (
          <ChatInlineAlert
            key="low-quota"
            variant="warning"
            icon={AlertTriangle}
            progressPct={lowQuota.pct}
            actions={
              <Link to="/pricing" className="font-semibold hover:underline shrink-0">
                Тарифы
              </Link>
            }
          >
            <span>Пул ИИ почти исчерпан ({lowQuota.pct?.toFixed?.(0) ?? '?'}%).</span>
          </ChatInlineAlert>
        )}
        {showTools && (
          <ChatInlineAlert
            key="tools-hint"
            variant="info"
            icon={Wrench}
            onDismiss={dismissTools}
            actions={
              <>
                <button type="button" onClick={openModels} className="font-semibold hover:underline">
                  Выбрать модель
                </button>
                {onOpenSettingsConnectors && (
                  <button
                    type="button"
                    onClick={onOpenSettingsConnectors}
                    className="hover:underline opacity-90"
                  >
                    Коннекторы
                  </button>
                )}
              </>
            }
          >
            <span>
              Подключено: {formatConnectorList(connectorsForChat)}. Нужна модель с бейджем{' '}
              <strong>Tools</strong>.
            </span>
          </ChatInlineAlert>
        )}
      </AnimatePresence>
    </div>
  );
}
