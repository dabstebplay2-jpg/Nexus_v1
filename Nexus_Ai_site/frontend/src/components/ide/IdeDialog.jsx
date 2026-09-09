import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';

const TONE_META = {
  info: { icon: Info, className: 'bg-sky-400/10 text-sky-300 border-sky-400/20' },
  success: { icon: CheckCircle2, className: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20' },
  error: { icon: AlertTriangle, className: 'bg-red-400/10 text-red-300 border-red-400/20' },
  danger: { icon: AlertTriangle, className: 'bg-red-400/10 text-red-300 border-red-400/20' },
};

export default function IdeDialog({ dialog, onClose }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!dialog) return undefined;
    setValue(dialog.defaultValue || '');
    setBusy(false);
    setError('');
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dialog, onClose]);

  if (!dialog) return null;

  const tone = TONE_META[dialog.tone] || TONE_META.info;
  const Icon = tone.icon;
  const isPrompt = dialog.type === 'prompt';
  const isNotice = dialog.type === 'notice';

  const submit = async (event) => {
    event?.preventDefault();
    if (busy) return;
    const nextValue = value.trim();
    if (isPrompt && !nextValue) {
      setError('Введите название.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await dialog.onConfirm?.(isPrompt ? nextValue : undefined);
      onClose();
    } catch (submitError) {
      setError(submitError?.message || 'Не удалось выполнить действие.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--ide-border)] bg-[#111116] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ide-dialog-title"
        onSubmit={submit}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${tone.className}`}>
              <Icon size={20} aria-hidden />
            </span>
            <button type="button" disabled={busy} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--ide-muted)] hover:bg-[var(--ide-hover)] hover:text-[var(--ide-fg)] disabled:opacity-50" aria-label="Закрыть">
              <X size={17} />
            </button>
          </div>
          <h2 id="ide-dialog-title" className="mt-4 text-lg font-semibold text-[var(--ide-fg)]">{dialog.title}</h2>
          {dialog.message ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ide-muted)]">{dialog.message}</p> : null}
          {isPrompt ? (
            <label className="mt-5 block text-xs font-medium text-[var(--ide-muted)]">
              {dialog.inputLabel || 'Название'}
              <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} maxLength={dialog.maxLength || 120} placeholder={dialog.placeholder || ''} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--ide-border)] bg-black/25 px-3 text-sm text-[var(--ide-fg)] outline-none placeholder:text-zinc-600 focus:border-teal-400/50" />
            </label>
          ) : null}
          {error ? <p className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200" role="alert">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--ide-border)] bg-black/15 px-5 py-3.5">
          {!isNotice ? <button type="button" disabled={busy} onClick={onClose} className="min-h-10 rounded-lg border border-[var(--ide-border)] px-4 text-xs font-semibold text-[var(--ide-fg)] hover:bg-[var(--ide-hover)] disabled:opacity-50">Отмена</button> : null}
          <button type="submit" disabled={busy} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold disabled:opacity-50 ${dialog.tone === 'danger' ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-teal-400 text-[#042f2e] hover:bg-teal-300'}`}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {dialog.confirmLabel || (isNotice ? 'Понятно' : isPrompt ? 'Создать' : 'Подтвердить')}
          </button>
        </div>
      </form>
    </div>
  );
}
