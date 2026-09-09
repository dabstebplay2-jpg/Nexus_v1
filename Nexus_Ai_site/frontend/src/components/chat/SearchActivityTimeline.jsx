import { Globe, Loader2, CheckCircle2, AlertCircle, Plug } from 'lucide-react';
import { formatConnectorList } from '../../features/connectors/connectorLabels';

function phaseLabel(step) {
  if (step.phase === 'reason') return 'Размышление перед поиском';
  if (step.phase === 'analyze') return 'Анализ запроса';
  if (step.phase === 'confirm') return 'Проверка фактов';
  if (step.phase === 'merge') return 'Сбор результатов';
  return 'Поиск';
}

function StepperItem({ active, done, isLast, children }) {
  const stateClass = active ? 'nx-stepper__item--active' : done ? 'nx-stepper__item--done' : '';
  return (
    <li className={`nx-stepper__item ${stateClass} nx-stepper__item--enter`}>
      <div className="nx-stepper__rail" aria-hidden>
        <span className="nx-stepper__node" />
        {!isLast && <span className="nx-stepper__line" />}
      </div>
      <div className="nx-stepper__content">{children}</div>
    </li>
  );
}

export default function SearchActivityTimeline({ searchActivity, isStreaming }) {
  const steps = searchActivity?.steps || [];
  const status = searchActivity?.status;
  const activeConnectors = searchActivity?.activeConnectors;
  if (!steps.length && !status) return null;

  const lastIdx = steps.length - 1;
  const depthLabel = searchActivity?.depthLabel;
  const connectorNames = formatConnectorList(activeConnectors);
  const statusIsConnector =
    status &&
    (status.startsWith('Коннектор:') ||
      status.startsWith('Сервисы:') ||
      status.startsWith('Готово:'));
  const StatusIcon = statusIsConnector ? Plug : Globe;
  const pillClass = statusIsConnector ? 'nx-status-pill nx-status-pill--info' : 'nx-status-pill';

  return (
    <div className="space-y-2 mb-1">
      {depthLabel && (
        <p
          className="text-[10px] uppercase tracking-wide font-semibold"
          style={{ color: 'var(--nx-activity-fg)' }}
        >
          Уровень: {depthLabel}
        </p>
      )}
      {status && (
        <div
          className={`${pillClass} ${isStreaming ? 'nx-status-shimmer' : ''}`}
          role="status"
        >
          {isStreaming ? (
            <Loader2 size={14} className="animate-spin shrink-0" />
          ) : (
            <StatusIcon size={14} className="shrink-0" />
          )}
          <span>{status}</span>
        </div>
      )}
      {connectorNames && isStreaming && !status?.startsWith('Сервисы:') && (
        <p className="text-[10px]" style={{ color: 'var(--nx-info-fg)' }}>
          Активны: {connectorNames}
        </p>
      )}
      {steps.length > 0 && (
        <ol className="nx-stepper mt-1">
          {steps.map((step, i) => {
            const active = isStreaming && i === lastIdx;
            const done = !active;
            const queries = Array.isArray(step.queries) ? step.queries : [];
            return (
              <StepperItem key={step.id || i} active={active} done={done} isLast={i === lastIdx}>
                <div className="flex items-center gap-2 normal-case tracking-normal">
                  {active ? (
                    <Loader2 size={12} className="animate-spin shrink-0" />
                  ) : (
                    <CheckCircle2
                      size={12}
                      className="shrink-0"
                      style={{ color: 'var(--nx-accent)' }}
                    />
                  )}
                  <span>
                    {phaseLabel(step)}
                    {step.round != null && step.maxRounds != null
                      ? ` · ${step.round}/${step.maxRounds}`
                      : ''}
                  </span>
                </div>
                {step.intent && step.phase === 'analyze' && (
                  <p
                    className="mt-1.5 text-[12px] leading-snug normal-case font-normal tracking-normal"
                    style={{ color: 'var(--nx-text)' }}
                  >
                    {step.intent}
                  </p>
                )}
                {queries.length > 0 && (
                  <div className="mt-1.5 normal-case font-normal tracking-normal">
                    {step.phase === 'analyze' && (
                      <p className="text-[10px] mb-1 opacity-70">Поисковые запросы:</p>
                    )}
                    <ul className="space-y-1">
                      {queries.map((q, qi) => (
                        <li
                          key={qi}
                          className="text-[11px] font-mono leading-snug opacity-85"
                          title={q}
                        >
                          {step.phase === 'analyze' ? `${qi + 1}. ${q}` : `«${q}»`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {step.message && (
                  <p className="mt-1 text-[11px] opacity-60 normal-case font-normal tracking-normal">
                    {step.message}
                  </p>
                )}
                {step.sourcesTotal != null && step.phase === 'merge' && (
                  <p className="mt-0.5 text-[11px] normal-case font-normal" style={{ color: 'var(--nx-accent)' }}>
                    {step.added != null && step.added > 0
                      ? `+${step.added} · всего ${step.sourcesTotal}`
                      : `Всего ${step.sourcesTotal} источников`}
                  </p>
                )}
              </StepperItem>
            );
          })}
        </ol>
      )}
      {status === 'failed' && (
        <div
          className="flex items-center gap-2 text-xs pl-1"
          style={{ color: 'var(--nx-warning-fg)' }}
        >
          <AlertCircle size={14} />
          <span>Поиск недоступен — ответ по знаниям модели</span>
        </div>
      )}
    </div>
  );
}
