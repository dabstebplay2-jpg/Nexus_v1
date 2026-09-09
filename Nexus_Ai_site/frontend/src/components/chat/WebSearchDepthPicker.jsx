import { Sparkles } from 'lucide-react';

/** Переключатель «Поиск в сети» (глубина всегда standard на бэкенде). */
export default function WebSearchDepthPicker({
  enabled,
  onEnabledChange,
  disabled = false,
  highlight = false,
}) {
  const active = Boolean(enabled);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onEnabledChange?.(!active)}
      className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 md:py-3 min-h-[44px] md:min-h-[52px] rounded-full border transition-colors shrink-0 ${
        highlight ? 'ring-2 ring-teal-400/50' : ''
      } ${
        active
          ? 'border-teal-500/50 bg-teal-500/15 text-teal-400'
          : 'border-[var(--nx-border)] bg-[var(--nx-surface-hover)] text-[var(--nx-muted)] hover:text-[var(--nx-text)]'
      }`}
      title={
        active
          ? 'Автоинструменты включены: Nexus сам выберет поиск, генерацию или подключённый сервис'
          : 'Включить автоматический выбор поиска и инструментов'
      }
    >
      <Sparkles size={20} className="shrink-0" />
      <span className="hidden sm:inline text-sm font-medium">Автоинструменты</span>
    </button>
  );
}
