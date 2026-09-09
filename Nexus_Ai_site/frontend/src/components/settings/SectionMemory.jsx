import { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Copy, Check, Sparkles, Loader2 } from 'lucide-react';
import { useUserMemory } from '../../context/UserMemoryContext';
import { buildExportPromptForOtherAi } from '../../config/memoryExportPrompt';
function SettingsRow({ label, desc, children }) {
  return (
    <div className="settings-row">
      <div>
        <span className="settings-row__label">{label}</span>
        {desc ? <span className="settings-row__desc">{desc}</span> : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`settings-toggle ${checked ? 'settings-toggle--on' : ''}`}
    >
      <span className="settings-toggle__knob" />
    </button>
  );
}

export default function SectionMemory() {
  const {
    content,
    setContent,
    enabled,
    setEnabled,
    autoLearn,
    setAutoLearn,
    loading,
    saving,
    synthesizing,
    error,
    persist,
    synthesize,
  } = useUserMemory();

  const [localContent, setLocalContent] = useState(content);
  const [savedHint, setSavedHint] = useState(false);
  const [copyHint, setCopyHint] = useState('');
  const [suggested, setSuggested] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  const scheduleSave = useCallback(
    (text, en, al) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await persist(text, en, al);
          setSavedHint(true);
          setTimeout(() => setSavedHint(false), 2000);
        } catch {
          /* error in context */
        }
      }, 800);
    },
    [persist]
  );

  const onContentChange = (e) => {
    const text = e.target.value;
    setLocalContent(text);
    setContent(text);
    scheduleSave(text, enabled, autoLearn);
  };

  const onToggleEnabled = (next) => {
    setEnabled(next);
    scheduleSave(localContent, next, autoLearn);
  };

  const onToggleAutoLearn = (next) => {
    setAutoLearn(next);
    scheduleSave(localContent, enabled, next);
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(label);
      setTimeout(() => setCopyHint(''), 2000);
    } catch {
      setCopyHint('Не удалось скопировать');
    }
  };

  const handleSynthesize = async () => {
    try {
      const text = await synthesize();
      setSuggested(text);
    } catch {
      /* context error */
    }
  };

  const applySuggested = () => {
    if (!suggested) return;
    setLocalContent(suggested);
    setContent(suggested);
    scheduleSave(suggested, enabled, autoLearn);
    setSuggested(null);
  };

  if (loading) {
    return <p className="settings-muted">Загрузка памяти…</p>;
  }

  return (
    <div className="settings-memory">
      <p className="settings-muted settings-memory__intro">
        Память подставляется во все чаты и пространства. «Запомни, что…» — сохранит факт; «Забудь…»
        или «Удали из памяти…» — уберёт его из этого списка.
      </p>

      {error ? <p className="settings-error">{error}</p> : null}

      <SettingsRow
        label="Учитывать память в чатах"
        desc="Если выключено, текст ниже не отправляется модели"
      >
        <Toggle checked={enabled} onChange={onToggleEnabled} label="Память в чатах" />
      </SettingsRow>

      <SettingsRow
        label="Запоминать, когда прошу в чате"
        desc="Срабатывает на «запомни», «не забудь», remember и похожие фразы"
      >
        <Toggle checked={autoLearn} onChange={onToggleAutoLearn} label="Автопамять из чата" />
      </SettingsRow>

      <div className="settings-memory__actions">
        <button
          type="button"
          className="settings-btn settings-btn--ghost"
          onClick={() => copyText(buildExportPromptForOtherAi({ currentDraft: localContent }), 'prompt')}
        >
          <Copy size={16} />
          Промпт для другой нейросети
        </button>
        <button
          type="button"
          className="settings-btn settings-btn--ghost"
          onClick={() => copyText(localContent, 'memory')}
          disabled={!localContent.trim()}
        >
          <Copy size={16} />
          Копировать память
        </button>
        <button
          type="button"
          className="settings-btn settings-btn--primary"
          onClick={handleSynthesize}
          disabled={synthesizing}
        >
          {synthesizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Обновить из чатов Nexus
        </button>
      </div>

      {copyHint ? (
        <p className="settings-memory__hint">
          <Check size={14} /> {copyHint === 'prompt' ? 'Промпт скопирован' : 'Память скопирована'}
        </p>
      ) : null}

      <label className="settings-memory__label" htmlFor="memory-content">
        Текст памяти
        <span className="settings-memory__counter">{localContent.length} / 8000</span>
      </label>
      <textarea
        id="memory-content"
        className="settings-memory__textarea select-text"
        value={localContent}
        onChange={onContentChange}
        maxLength={8000}
        rows={14}
        placeholder="Например: меня зовут…, работаю с…, предпочитаю ответы на русском, кратко, стек: React, Python…"
      />

      <p className="settings-muted text-xs">
        {saving ? 'Сохранение…' : savedHint ? 'Сохранено' : 'Изменения сохраняются автоматически'}
      </p>

      {suggested ? (
        <div className="settings-memory__preview">
          <div className="settings-memory__preview-head">
            <Brain size={16} />
            <span>Предложение из ваших чатов</span>
          </div>
          <pre className="settings-memory__preview-body select-text">{suggested}</pre>
          <div className="settings-memory__preview-actions">
            <button type="button" className="settings-btn settings-btn--primary" onClick={applySuggested}>
              Заменить память
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--ghost"
              onClick={() => setSuggested(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
