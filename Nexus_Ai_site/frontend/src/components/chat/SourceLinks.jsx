import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { ensureArray } from '../../lib/normalizeArrays';

export default function SourceLinks({ sources }) {
  const list = ensureArray(sources);
  const [open, setOpen] = useState(false);
  if (!list.length) return null;

  return (
    <div className="mt-4 not-prose">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-teal-400/95 hover:text-teal-300 transition-colors"
        aria-expanded={open}
      >
        <BookOpen size={15} className="shrink-0 opacity-80" />
        <span>Источники ({list.length})</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <ul className="mt-2 max-h-72 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-black/25 divide-y divide-white/[0.06]">
          {list.map((s, i) => (
            <li key={`${s.url}-${i}`}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="flex gap-2 px-3 py-2.5 hover:bg-white/[0.04] transition-colors group"
              >
                <ExternalLink
                  size={14}
                  className="shrink-0 mt-0.5 text-cyan-500/70 group-hover:text-cyan-400"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200 group-hover:text-white line-clamp-2">
                    {s.title || s.url}
                  </p>
                  {s.snippet && s.snippet !== s.title && (
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{s.snippet}</p>
                  )}
                  <p className="text-[11px] text-zinc-600 mt-0.5 truncate font-mono">{s.url}</p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
