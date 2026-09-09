import { useMemo, useState, useEffect } from 'react';
import {
  EXTENSION_CATALOG,
  RECOMMENDED_EXTENSION_IDS,
  getInstalledIds,
  installExtension,
  uninstallExtension,
} from '../../lib/extensionsStore';

export default function ExtensionsPanel({ onOpenView }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | installed | recommended
  const [installed, setInstalled] = useState(getInstalledIds());

  useEffect(() => {
    const sync = () => setInstalled(getInstalledIds());
    window.addEventListener('nexus-extensions-changed', sync);
    return () => window.removeEventListener('nexus-extensions-changed', sync);
  }, []);

  const list = useMemo(() => {
    let items = [...EXTENSION_CATALOG];
    if (filter === 'installed') {
      items = items.filter((e) => installed.includes(e.id));
    }
    if (filter === 'recommended') {
      items = items.filter((e) => RECOMMENDED_EXTENSION_IDS.includes(e.id));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.publisher.toLowerCase().includes(q)
      );
    }
    return items;
  }, [query, filter, installed]);

  return (
    <div className="flex flex-col h-full overflow-hidden text-[13px]">
      <div className="px-3 py-2 border-b border-vscode-border shrink-0">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Extensions in Marketplace"
          className="w-full vscode-input px-2 py-1.5 text-[12px] mb-2"
        />
        <div className="flex gap-1 text-[11px]">
          {[
            ['all', 'Marketplace'],
            ['recommended', 'Recommended'],
            ['installed', 'Installed'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`px-2 py-0.5 rounded ${
                filter === id ? 'bg-vscode-accent text-white' : 'text-vscode-muted hover:text-vscode-fg'
              }`}
            >
              {label}
              {id === 'installed' && ` (${installed.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {list.length === 0 ? (
          <p className="p-4 text-vscode-muted text-xs">Ничего не найдено.</p>
        ) : (
          list.map((ext) => {
            const isOn = installed.includes(ext.id);
            return (
              <div
                key={ext.id}
                className="flex gap-3 px-3 py-3 border-b border-vscode-border/50 hover:bg-vscode-list-hover"
              >
                <div className="w-10 h-10 shrink-0 rounded bg-vscode-input flex items-center justify-center text-xl">
                  {ext.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold text-vscode-fg">{ext.name}</span>
                      <span className="text-vscode-muted ml-2 text-[11px]">{ext.publisher}</span>
                    </div>
                    <span className="text-[10px] text-vscode-muted shrink-0">v{ext.version}</span>
                  </div>
                  <p className="text-[11px] text-vscode-muted mt-1 line-clamp-2">{ext.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-vscode-muted">
                    <span>⬇ {ext.downloads}</span>
                    <span>★ {ext.rating}</span>
                    <span className="px-1.5 py-0.5 bg-vscode-badge rounded">{ext.category}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {isOn ? (
                      <>
                        <button
                          type="button"
                          onClick={() => uninstallExtension(ext.id)}
                          className="px-2 py-1 text-[11px] border border-vscode-border rounded hover:bg-vscode-list-hover"
                        >
                          Uninstall
                        </button>
                        {ext.enablesView && onOpenView && (
                          <button
                            type="button"
                            onClick={() => onOpenView(ext.enablesView)}
                            className="px-2 py-1 text-[11px] bg-vscode-accent text-white rounded"
                          >
                            Open
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          installExtension(ext.id);
                          setInstalled(getInstalledIds());
                        }}
                        className="px-3 py-1 text-[11px] bg-vscode-accent text-white rounded font-semibold"
                      >
                        Install
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
