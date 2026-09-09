import { useState, useEffect } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';
import SearchActivityTimeline from './SearchActivityTimeline';

export default function ThinkingBlock({
  preSearchThinking,
  thinking,
  searchActivity,
  isStreaming,
}) {
  const preText = (preSearchThinking || '').trim();
  const thinkText = (thinking || '').trim();
  const hasPre = Boolean(preText);
  const hasSearch = Boolean(searchActivity?.steps?.length || searchActivity?.status);
  const hasAnswerThink = Boolean(thinkText);
  const hasThinking = hasPre || hasAnswerThink;
  const busy = isStreaming && (hasSearch || hasPre || !hasAnswerThink);

  const [open, setOpen] = useState(busy);

  useEffect(() => {
    if (busy) setOpen(true);
    else if (!isStreaming && (hasSearch || hasThinking)) setOpen(false);
  }, [busy, isStreaming, hasSearch, hasThinking]);

  if (!hasSearch && !hasThinking && !isStreaming) return null;

  const title = hasSearch
    ? hasThinking
      ? 'Поиск и рассуждение'
      : 'Поиск в сети'
    : 'Мышление модели';

  return (
    <div className="nx-activity-panel mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nx-activity-panel__header hover:opacity-90 transition-opacity"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="nx-activity-panel__icon" aria-hidden>
          <Brain size={14} />
        </span>
        <span>{title}</span>
        {busy && (
          <span className="nx-busy-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        )}
      </button>
      <div className="nx-activity-collapse" data-open={open ? 'true' : 'false'}>
        <div className="nx-activity-panel__body custom-scrollbar space-y-2 select-text">
          {hasPre && (
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
                style={{ color: 'var(--nx-activity-fg)' }}
              >
                Размышление перед поиском
              </p>
              <pre
                className="text-[12px] leading-relaxed whitespace-pre-wrap font-mono opacity-90"
                style={{ color: 'var(--nx-text)' }}
              >
                {preText}
              </pre>
            </div>
          )}
          {hasSearch && (
            <div
              className={hasPre ? 'pt-2' : ''}
              style={hasPre ? { borderTop: '1px solid var(--nx-activity-border)' } : undefined}
            >
              <SearchActivityTimeline searchActivity={searchActivity} isStreaming={isStreaming} />
            </div>
          )}
          {hasAnswerThink && (
            <div
              className={hasPre || hasSearch ? 'pt-2' : ''}
              style={
                hasPre || hasSearch
                  ? { borderTop: '1px solid var(--nx-activity-border)' }
                  : undefined
              }
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
                style={{ color: 'var(--nx-activity-fg)' }}
              >
                Рассуждение при ответе
              </p>
              <pre
                className="text-[12px] leading-relaxed whitespace-pre-wrap font-mono opacity-90"
                style={{ color: 'var(--nx-text)' }}
              >
                {thinkText}
              </pre>
            </div>
          )}
          {!hasThinking && busy && !hasSearch && (
            <p className="text-[12px] opacity-60" style={{ color: 'var(--nx-text)' }}>
              …
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
