import { useMemo, useState } from 'react';
import { Editor } from '@monaco-editor/react';
import { X, Copy, Check, Download, FileCode2, Eye, Code2 } from 'lucide-react';
import { monacoLanguage } from '../../lib/parseMessageContent';

export default function CodeArtifactPanel({
  files = [],
  activeFileId,
  onSelectFile,
  onClose,
  streaming = false,
}) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState('code');

  const active = useMemo(
    () => files.find((f) => f.id === activeFileId) || files[files.length - 1],
    [files, activeFileId]
  );

  const canPreview =
    active &&
    (active.language === 'html' ||
      active.filename?.toLowerCase().endsWith('.html') ||
      active.filename?.toLowerCase().endsWith('.htm'));

  const handleCopy = async () => {
    if (!active?.content) return;
    try {
      await navigator.clipboard.writeText(active.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleDownload = () => {
    if (!active) return;
    const blob = new Blob([active.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = active.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!files.length) return null;

  return (
    <aside className="flex flex-col w-full lg:w-[min(48%,520px)] xl:w-[min(44%,560px)] border-l border-[var(--nx-border)] bg-[#0c0c0e] shrink-0 min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--nx-border)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 size={16} className="text-teal-400 shrink-0" />
          <span className="text-sm font-semibold text-[var(--nx-text)] truncate">Код</span>
          {streaming && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 animate-pulse">
              пишет…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canPreview && (
            <button
              type="button"
              onClick={() => setView((v) => (v === 'code' ? 'preview' : 'code'))}
              className="p-2 rounded-lg text-[var(--nx-muted)] hover:bg-white/5 hover:text-[var(--nx-text)]"
              title={view === 'code' ? 'Превью' : 'Код'}
            >
              {view === 'code' ? <Eye size={15} /> : <Code2 size={15} />}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="p-2 rounded-lg text-[var(--nx-muted)] hover:bg-white/5 hover:text-[var(--nx-text)]"
            title="Копировать"
          >
            {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 rounded-lg text-[var(--nx-muted)] hover:bg-white/5 hover:text-[var(--nx-text)]"
            title="Скачать файл"
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--nx-muted)] hover:bg-white/5 hover:text-[var(--nx-text)]"
            title="Закрыть"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-2 py-2 overflow-x-auto custom-scrollbar shrink-0 border-b border-[var(--nx-border)]">
        {files.map((f) => {
          const selected = f.id === active?.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelectFile?.(f.id)}
              className={`shrink-0 text-left px-3 py-2 rounded-xl border transition-colors min-w-[120px] max-w-[200px] ${
                selected
                  ? 'border-teal-500/40 bg-teal-500/10'
                  : 'border-[var(--nx-border)] bg-white/[0.02] hover:bg-white/[0.05]'
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-teal-400/90 truncate">
                {f.languageLabel}
              </p>
              <p className="text-xs text-[var(--nx-muted)] mt-0.5 truncate">
                файл · {f.filename}
              </p>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="px-3 py-2 border-b border-[var(--nx-border)] shrink-0">
          <p className="text-[11px] text-[var(--nx-muted)]">
            <span className="text-teal-400 font-semibold">{active.languageLabel}</span>
            <span className="mx-2 text-white/20">·</span>
            <span className="font-mono text-[var(--nx-text)]">файл {active.filename}</span>
            {!active.complete && (
              <span className="ml-2 text-amber-500/90">(запись…)</span>
            )}
          </p>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {view === 'preview' && canPreview && active ? (
          <iframe
            title="preview"
            sandbox="allow-scripts allow-same-origin"
            srcDoc={active.content}
            className="absolute inset-0 w-full h-full bg-white"
          />
        ) : (
          <Editor
            key={`${active?.id}-${active?.content?.length}`}
            value={active?.content ?? ''}
            language={monacoLanguage(active?.language, active?.filename)}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 12 },
              automaticLayout: true,
            }}
            loading={
              <div className="flex items-center justify-center h-full text-sm text-[var(--nx-muted)]">
                Загрузка редактора…
              </div>
            }
          />
        )}
      </div>
    </aside>
  );
}
