import { X, FileText, Image as ImageIcon } from 'lucide-react';
import { ensureArray } from '../../lib/normalizeArrays';

export default function AttachmentBar({ attachments, onRemove }) {
  const list = ensureArray(attachments);
  if (!list.length) return null;

  return (
    <div className="flex flex-wrap gap-2 px-5 pt-3 pb-1">
      {list.map((a) => (
        <div
          key={a.id}
          className="relative flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 max-w-[200px]"
        >
          {a.kind === 'image' && a.previewUrl ? (
            <img
              src={a.previewUrl}
              alt={a.name}
              className="w-10 h-10 rounded-lg object-cover shrink-0"
            />
          ) : (
            <span className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              {a.kind === 'image' ? (
                <ImageIcon size={16} className="text-cyan-400" />
              ) : (
                <FileText size={16} className="text-zinc-400" />
              )}
            </span>
          )}
          <span className="text-[11px] text-zinc-300 truncate min-w-0" title={a.name}>
            {a.name}
          </span>
          <button
            type="button"
            onClick={() => onRemove?.(a.id)}
            className="p-0.5 rounded-md hover:bg-white/10 text-zinc-500 hover:text-zinc-200"
            aria-label="Удалить вложение"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
