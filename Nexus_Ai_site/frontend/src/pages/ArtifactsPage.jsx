import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { EmptyState, PageHero, ProductPage, SurfaceCard } from '../components/ui/ProductPage';
import { useArtifacts } from '../context/ArtifactContext';
import { imageDisplaySrc } from '../lib/imagePersistence';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'image', label: 'Изображения' },
  { id: 'code', label: 'Код' },
  { id: 'file', label: 'Файлы' },
];

function kindMeta(kind) {
  if (kind === 'image') return { icon: ImageIcon, label: 'Изображение', color: 'text-violet-300' };
  if (kind === 'code') return { icon: FileCode2, label: 'Код', color: 'text-sky-300' };
  return { icon: FileText, label: 'Файл', color: 'text-amber-300' };
}

function artifactPreviewSrc(artifact) {
  if (artifact.kind !== 'image') return '';
  return artifact.preview || imageDisplaySrc(artifact.content) || '';
}

function artifactHref(artifact) {
  const preview = artifactPreviewSrc(artifact);
  if (preview) return preview;
  if (artifact.kind === 'code' && artifact.content?.code) {
    return `data:text/plain;charset=utf-8,${encodeURIComponent(artifact.content.code)}`;
  }
  return artifact.content?.url || '';
}

function artifactFileName(artifact) {
  if (artifact.content?.fileName) return artifact.content.fileName;
  if (artifact.kind === 'image') return `${artifact.title || 'nexus-image'}.png`;
  return `${artifact.title || 'nexus-artifact'}.txt`;
}

function ArtifactSkeleton() {
  return (
    <div className="nx-panel overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-white/[0.04]" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-2/3 rounded bg-white/[0.06]" />
        <div className="h-2.5 w-1/3 rounded bg-white/[0.04]" />
      </div>
    </div>
  );
}

export default function ArtifactsPage() {
  const { artifacts, artifactsReady, artifactsError, removeArtifact } = useArtifacts();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const counts = useMemo(
    () => ({
      all: artifacts.length,
      image: artifacts.filter((artifact) => artifact.kind === 'image').length,
      code: artifacts.filter((artifact) => artifact.kind === 'code').length,
      file: artifacts.filter((artifact) => artifact.kind === 'file').length,
    }),
    [artifacts]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return artifacts.filter((artifact) => {
      if (filter !== 'all' && artifact.kind !== filter) return false;
      if (!normalizedQuery) return true;
      return `${artifact.title || ''} ${artifact.content?.language || ''}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [artifacts, filter, query]);

  const copyCode = async (artifact) => {
    const code = artifact.content?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(artifact.id);
      window.setTimeout(() => setCopiedId(''), 1600);
    } catch {
      /* Clipboard may be unavailable outside a secure context. */
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await removeArtifact(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell hideHistory>
      <ProductPage>
        <PageHero
          eyebrow="Библиотека результатов"
          icon={LayoutGrid}
          title="Ваши артефакты"
          description="Изображения и код из чатов сохраняются здесь автоматически. Их можно открыть, скачать, скопировать или удалить в любой момент."
          aside={
            <SurfaceCard className="grid grid-cols-3 divide-x divide-[var(--nx-border)]">
              {[
                ['Всего', counts.all],
                ['Фото', counts.image],
                ['Код', counts.code],
              ].map(([label, value]) => (
                <div key={label} className="min-w-20 px-4 py-3 text-center">
                  <strong className="block text-lg text-[var(--nx-text)]">{value}</strong>
                  <span className="text-[10px] uppercase tracking-wide text-[var(--nx-muted)]">{label}</span>
                </div>
              ))}
            </SurfaceCard>
          }
        />

        {artifactsError ? (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden />
            <span>{artifactsError}. Локально сохранённые результаты остаются доступны.</span>
          </div>
        ) : null}

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto scrollbar-none" role="tablist" aria-label="Тип артефакта">
            {FILTERS.map((item) => {
              const active = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(item.id)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'border-teal-400/40 bg-teal-400/10 text-teal-200'
                      : 'border-[var(--nx-border)] bg-[var(--nx-surface-soft)] text-[var(--nx-muted)] hover:text-[var(--nx-text)]'
                  }`}
                >
                  {item.label}
                  <span className="ml-2 text-[10px] opacity-60">{counts[item.id] || 0}</span>
                </button>
              );
            })}
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface-soft)] px-3 sm:w-64">
            <Search size={16} className="shrink-0 text-[var(--nx-muted)]" aria-hidden />
            <span className="sr-only">Поиск артефактов</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти по названию…"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--nx-text)] outline-none placeholder:text-[var(--nx-muted)]"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск" className="text-[var(--nx-muted)] hover:text-[var(--nx-text)]">
                <X size={15} />
              </button>
            ) : null}
          </label>
        </div>

        {!artifactsReady ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Загрузка артефактов">
            {Array.from({ length: 8 }, (_, index) => <ArtifactSkeleton key={index} />)}
          </div>
        ) : filtered.length === 0 ? (
          <SurfaceCard>
            <EmptyState
              icon={query || filter !== 'all' ? Search : Sparkles}
              title={query || filter !== 'all' ? 'Ничего не найдено' : 'Создайте первый артефакт'}
              description={
                query || filter !== 'all'
                  ? 'Измените запрос или выберите другой тип результата.'
                  : 'Попросите Nexus написать код или создать изображение — результат автоматически появится в этой библиотеке.'
              }
              action={
                query || filter !== 'all' ? (
                  <button type="button" className="nx-btn nx-btn--secondary" onClick={() => { setQuery(''); setFilter('all'); }}>
                    Сбросить фильтры
                  </button>
                ) : (
                  <Link to="/" className="nx-btn nx-btn--primary">
                    Открыть чат
                    <ExternalLink size={16} aria-hidden />
                  </Link>
                )
              }
            />
          </SurfaceCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((artifact) => {
              const meta = kindMeta(artifact.kind);
              const Icon = meta.icon;
              const preview = artifactPreviewSrc(artifact);
              const href = artifactHref(artifact);
              const canCopy = artifact.kind === 'code' && Boolean(artifact.content?.code);
              return (
                <SurfaceCard as="article" key={artifact.id} className="group flex min-h-full flex-col" interactive>
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-[var(--nx-border)] bg-black/20">
                    {preview ? (
                      <img src={preview} alt={artifact.title || 'Артефакт Nexus'} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                    ) : (
                      <div className="p-6 text-center">
                        <Icon size={34} className={`mx-auto ${meta.color}`} aria-hidden />
                        {artifact.content?.language ? (
                          <span className="mt-3 block font-mono text-[10px] uppercase tracking-widest text-[var(--nx-muted)]">
                            {artifact.content.language}
                          </span>
                        ) : null}
                      </div>
                    )}
                    <span className="absolute left-2.5 top-2.5 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-medium text-zinc-200 backdrop-blur-md">
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--nx-text)]">{artifact.title || 'Без названия'}</h2>
                    <time className="mt-1.5 text-[10px] text-[var(--nx-muted)]">
                      {new Date(artifact.createdAt || Date.now()).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                    <div className="mt-5 flex items-center gap-1.5 border-t border-[var(--nx-border)] pt-3">
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/[0.05] px-2 text-xs text-[var(--nx-text)] hover:bg-white/[0.09]">
                          <ExternalLink size={14} aria-hidden />
                          Открыть
                        </a>
                      ) : null}
                      {canCopy ? (
                        <button type="button" onClick={() => copyCode(artifact)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--nx-border)] text-[var(--nx-muted)] hover:text-[var(--nx-text)]" aria-label="Копировать код">
                          {copiedId === artifact.id ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                        </button>
                      ) : null}
                      {href ? (
                        <a href={href} download={artifactFileName(artifact)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--nx-border)] text-[var(--nx-muted)] hover:text-[var(--nx-text)]" aria-label="Скачать артефакт">
                          <Download size={15} />
                        </a>
                      ) : null}
                      <button type="button" onClick={() => setPendingDelete(artifact)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[var(--nx-muted)] hover:border-red-400/20 hover:bg-red-400/10 hover:text-red-300" aria-label="Удалить артефакт">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        )}
      </ProductPage>

      {pendingDelete ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDelete(null); }}>
          <div className="nx-panel w-full max-w-md p-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="delete-artifact-title">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-400/10 text-red-300"><Trash2 size={20} /></span>
            <h2 id="delete-artifact-title" className="mt-4 text-lg font-semibold text-[var(--nx-text)]">Удалить артефакт?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--nx-muted)]">«{pendingDelete.title || 'Без названия'}» будет удалён из локальной и облачной библиотеки.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="nx-btn nx-btn--secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>Отмена</button>
              <button type="button" className="nx-btn border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25" onClick={confirmDelete} disabled={deleting}>{deleting ? 'Удаляем…' : 'Удалить'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
