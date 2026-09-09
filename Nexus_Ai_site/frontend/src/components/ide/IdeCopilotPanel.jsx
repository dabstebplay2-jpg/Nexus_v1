import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Trash2,
  RefreshCw,
  Send,
  Wrench,
  FileSearch,
  TestTube2,
  Zap,
  FolderTree,
} from 'lucide-react';
import ModelPicker from '../chat/ModelPicker';
import { formatBalanceUsd } from '../../lib/formatBalance';

const QUICK_ACTIONS = [
  {
    id: 'fix',
    icon: Wrench,
    label: 'Исправить проект',
    prompt:
      'Просканируй workspace: найди ошибки, сломанные импорты и несоответствия. Исправь файлы через patch_file, запусти проверки в терминале.',
  },
  {
    id: 'explain',
    icon: FileSearch,
    label: 'Объяснить код',
    prompt:
      'Объясни архитектуру этого проекта и активный файл. Кратко: структура папок, точки входа, ключевые зависимости.',
  },
  {
    id: 'tests',
    icon: TestTube2,
    label: 'Добавить тесты',
    prompt:
      'Добавь или дополни тесты для текущего модуля. Создай файлы, запусти тестовую команду в терминале и сообщи результат.',
  },
  {
    id: 'feature',
    icon: Zap,
    label: 'Сделать фичу',
    prompt:
      'Реализуй запрошенную фичу end-to-end: код, конфиг, при необходимости UI. Используй инструменты IDE, открой изменённые файлы.',
  },
];

export default function IdeCopilotPanel({
  authStatus,
  models = [],
  mediaModels = [],
  selectedModel,
  onModelChange,
  chatHistory,
  aiLoading,
  aiInput,
  onAiInputChange,
  onSend,
  onClear,
  useFileContext,
  onUseFileContextChange,
  activeFile,
  hasWorkspace,
  demoMode = false,
  lastPromptCost,
  quotaRemainingUsd,
  profile,
}) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, aiLoading]);

  const submit = (e) => {
    e?.preventDefault();
    onSend?.();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden ide-copilot-panel">
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-[var(--ide-border)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="ide-copilot-glow flex h-8 w-8 items-center justify-center rounded-lg">
              <Sparkles size={16} className="text-teal-400" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--ide-fg)] truncate">Nexus Agent</p>
              <p className="text-[10px] text-[var(--ide-muted)] truncate">
                Файлы · патчи · терминал · редактор
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="p-1.5 rounded-lg hover:bg-[var(--ide-hover)] text-[var(--ide-muted)]"
            title="Очистить чат"
          >
            <Trash2 size={14} />
          </button>
        </div>
        {authStatus.authorized &&
          (profile?.monthly_cap_rub > 0 ||
            profile?.monthly_cap_usd > 0 ||
            profile?.daily_cap_rub > 0) && (
          <p className="mt-2 text-[10px] text-[var(--ide-muted)] font-mono">
            Пул ИИ (месяц):{' '}
            {profile?.monthly_remaining_rub != null
              ? `${Math.round(profile.monthly_remaining_rub).toLocaleString('ru-RU')} ₽`
              : profile?.daily_remaining_rub != null
                ? `${Math.round(profile.daily_remaining_rub).toLocaleString('ru-RU')} ₽`
                : formatBalanceUsd(quotaRemainingUsd, { digits: 2 })}
            {lastPromptCost != null && (
              <span className="text-teal-500/90"> · −{formatBalanceUsd(lastPromptCost, { digits: 4 })}</span>
            )}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar">
        {chatHistory.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--ide-muted)] leading-relaxed px-1">
              {demoMode
                ? 'Agent работает через облако Nexus. Файлы — из демо-проекта в браузере (сохраняются на этом устройстве).'
                : 'Агент может читать и менять файлы, выполнять команды в терминале и открывать вкладки.'}
              {' '}Опишите задачу — или выберите сценарий:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map(({ id, icon: Icon, label, prompt }, i) => (
                <motion.button
                  key={id}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  disabled={!authStatus.authorized || aiLoading}
                  onClick={() => onSend?.(prompt)}
                  className="ide-quick-action text-left p-2.5 rounded-xl disabled:opacity-40"
                >
                  <Icon size={14} className="text-teal-400 mb-1" />
                  <span className="text-[11px] font-medium text-[var(--ide-fg)] block">{label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {chatHistory.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col gap-1 text-xs ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <span className="text-[9px] font-bold uppercase text-[var(--ide-muted)]">
              {msg.role === 'user' ? 'Вы' : 'Agent'}
            </span>
            <div
              className={`p-2.5 rounded-xl max-w-[98%] whitespace-pre-wrap leading-relaxed select-text ${
                msg.role === 'user'
                  ? 'ide-msg-user'
                  : 'ide-msg-assistant'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {aiLoading && (
          <div className="flex items-center gap-2 text-xs text-[var(--ide-muted)] animate-pulse px-1">
            <RefreshCw size={12} className="animate-spin text-teal-400" />
            Агент выполняет инструменты…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 p-3 border-t border-[var(--ide-border)] space-y-2 ide-copilot-input-area">
        <div className="flex flex-wrap gap-1.5">
          {hasWorkspace && (
            <span className="text-[9px] px-2 py-0.5 rounded-full border border-teal-500/30 text-teal-400/90 flex items-center gap-1">
              <FolderTree size={10} /> Workspace
            </span>
          )}
          {activeFile && useFileContext && (
            <span className="text-[9px] px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-400/90 truncate max-w-[140px]">
              {activeFile.name}
            </span>
          )}
        </div>

        <div className="w-full min-w-0">
          <ModelPicker
            models={models}
            mediaModels={mediaModels}
            value={selectedModel}
            onChange={onModelChange}
            disabled={!authStatus.authorized}
            compact
            dropUp
            className="w-full"
          />
        </div>

        {activeFile && (
          <label className="flex items-center gap-2 text-[11px] text-[var(--ide-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={useFileContext}
              onChange={(e) => onUseFileContextChange(e.target.checked)}
              className="accent-teal-500 rounded"
            />
            Включить активный файл в контекст
          </label>
        )}

        <form onSubmit={submit} className="flex gap-2">
          <textarea
            value={aiInput}
            onChange={(e) => onAiInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            disabled={!authStatus.authorized || aiLoading}
            placeholder={
              authStatus.authorized
                ? 'Опишите задачу: создай API, почини баг, рефакторинг…'
                : 'Войдите в аккаунт (вкладка Account)'
            }
            className="flex-1 resize-none rounded-xl border border-[var(--ide-border)] bg-[var(--ide-input)] px-3 py-2 text-xs text-[var(--ide-fg)] outline-none focus:border-teal-500/50"
          />
          <button
            type="submit"
            disabled={aiLoading || !aiInput.trim() || !authStatus.authorized}
            className="self-end p-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-30"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
