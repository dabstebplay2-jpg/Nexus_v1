import { useEffect, useMemo, useState } from 'react';

export default function CommandPalette({ open, onClose, commands }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q)
    );
  }, [commands, query]);

  if (!open) return null;

  const run = (cmd) => {
    onClose();
    cmd.run?.();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-vscode-sidebar border border-vscode-border rounded-lg shadow-2xl overflow-hidden">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && filtered[0]) run(filtered[0]);
          }}
          placeholder="> Type a command name..."
          className="w-full px-4 py-3 bg-vscode-editor text-vscode-fg text-sm outline-none border-b border-vscode-border font-mono"
        />
        <ul className="max-h-80 overflow-y-auto custom-scrollbar py-1">
          {filtered.map((cmd) => (
            <li key={cmd.id}>
              <button
                type="button"
                onClick={() => run(cmd)}
                className="w-full px-4 py-2 text-left hover:bg-vscode-list-hover flex justify-between gap-4 items-center"
              >
                <span>
                  <span className="text-[10px] uppercase text-vscode-muted mr-2">{cmd.category}</span>
                  <span className="text-vscode-fg text-[13px]">{cmd.label}</span>
                </span>
                {cmd.keys && (
                  <span className="text-[10px] text-vscode-muted font-mono shrink-0">{cmd.keys}</span>
                )}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-vscode-muted text-sm">No matching commands</li>
          )}
        </ul>
      </div>
    </div>
  );
}
