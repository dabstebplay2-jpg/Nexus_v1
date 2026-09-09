import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Search,
  Star,
  X,
  Monitor,
  Cloud,
  SlidersHorizontal,
} from 'lucide-react';
import { modelKey, type Model, type Provider } from '@axiom/shared';
const labels: Record<string, string> = {
  text: 'Текст',
  imageInput: 'Изображения',
  tools: 'Tools',
  reasoning: 'Reasoning',
  web: 'Web',
  imageGeneration: 'Генерация изображений',
  videoGeneration: 'Видео',
  streaming: 'Streaming',
};
export function ModelSelector({
  models,
  providers,
  selected,
  favorites,
  onSelect,
  onFavorite,
  onSettings,
  disabled,
}: {
  models: Model[];
  providers: Provider[];
  selected?: Model;
  favorites: string[];
  onSelect: (model: Model) => void;
  onFavorite: (key: string) => void;
  onSettings: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const filtered = models.filter((m) =>
    `${m.displayName} ${providers.find((p) => p.id === m.provider)?.name ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const groups = [
    {
      key: 'favorites',
      name: 'Избранные',
      models: filtered.filter((m) => favorites.includes(modelKey(m))),
    },
    ...providers.map((p) => ({
      key: p.id,
      name: p.name,
      models: filtered.filter((m) => m.provider === p.id),
    })),
  ];
  return (
    <div
      className="model-selector"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          root.current?.querySelector('button')?.focus();
        }
      }}
    >
      <button
        className="model-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-label="Выбрать модель"
        onClick={() => setOpen(!open)}
      >
        <span className="model-dot" />
        {selected?.displayName ?? 'Выберите модель'}
        <ChevronDown size={14} />
      </button>
      {open && (
        <section className="model-popover" aria-label="Модели">
          <div className="popover-heading">
            <strong>Выберите модель</strong>
            <button
              className="icon-button"
              aria-label="Закрыть выбор модели"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <label className="model-search">
            <Search size={16} />
            <input
              autoFocus
              placeholder="Найти модель или провайдера"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="model-list">
            {groups.map(
              (group) =>
                group.models.length > 0 && (
                  <div key={group.key}>
                    <div className="group-label">{group.name}</div>
                    {group.models.map((model) => (
                      <div className="model-row" key={modelKey(model)}>
                        <button
                          className="model-option"
                          onClick={() => {
                            onSelect(model);
                            setOpen(false);
                          }}
                        >
                          <span className="model-option-title">
                            {model.locality === 'local' ? (
                              <Monitor size={16} />
                            ) : (
                              <Cloud size={16} />
                            )}
                            <strong>{model.displayName}</strong>
                            {selected && modelKey(selected) === modelKey(model) && (
                              <Check size={15} className="accent" />
                            )}
                          </span>
                          <span className="model-caps">
                            {model.contextWindow
                              ? `${Math.round(model.contextWindow / 1024)}k контекст · `
                              : ''}
                            {model.locality === 'local' ? 'Локальная' : 'Облачная'}
                          </span>
                          <span className="capabilities">
                            {Object.entries(model.capabilities)
                              .filter(([, enabled]) => enabled)
                              .map(([cap]) => (
                                <span key={cap}>{labels[cap] ?? cap}</span>
                              ))}
                          </span>
                        </button>
                        <button
                          className={`icon-button favorite ${favorites.includes(modelKey(model)) ? 'is-favorite' : ''}`}
                          aria-label={`${favorites.includes(modelKey(model)) ? 'Убрать из избранного' : 'В избранное'}: ${model.displayName}`}
                          onClick={() => onFavorite(modelKey(model))}
                        >
                          <Star size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ),
            )}
            {!filtered.length && <p className="muted empty-models">Модели не найдены</p>}
          </div>
          <button
            className="popover-footer"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
          >
            <SlidersHorizontal size={15} />
            Управление подключениями<span>↗</span>
          </button>
        </section>
      )}
    </div>
  );
}
