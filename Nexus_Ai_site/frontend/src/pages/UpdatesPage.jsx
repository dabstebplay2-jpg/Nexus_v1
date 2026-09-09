import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Layers3,
  Radio,
  Sparkles,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import LegalFooter from '../components/LegalFooter';
import { BrowserDownloadStrip } from '../components/BrowserDownloadCta';
import changelogData from '../data/changelog.json';

const LABELS = {
  'Новое': {
    icon: Sparkles,
    color: 'text-emerald-200',
    chip: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  },
  'Улучшено': {
    icon: TrendingUp,
    color: 'text-sky-200',
    chip: 'border-sky-300/25 bg-sky-300/10 text-sky-100',
  },
  'Исправлено': {
    icon: Wrench,
    color: 'text-amber-200',
    chip: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  },
};

const FILTERS = [
  { id: 'all', label: 'Все', icon: Layers3 },
  { id: 'Новое', label: 'Новое', icon: Sparkles },
  { id: 'Улучшено', label: 'Улучшено', icon: TrendingUp },
  { id: 'Исправлено', label: 'Исправлено', icon: Wrench },
];

function labelMeta(label) {
  return (
    LABELS[label] || {
      icon: CheckCircle2,
      color: 'text-zinc-200',
      chip: 'border-white/10 bg-white/5 text-zinc-200',
    }
  );
}

function countChanges(entries, label) {
  return entries.reduce((sum, entry) => {
    return sum + (entry.changes || []).filter((change) => change.label === label).length;
  }, 0);
}

function ReleaseChange({ change }) {
  const meta = labelMeta(change.label);
  const Icon = meta.icon;

  return (
    <li className="group flex gap-3 rounded-md px-1 py-2">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${meta.chip}`}>
        <Icon size={14} />
      </span>
      <span className="min-w-0">
        <span className={`block text-xs font-semibold ${meta.color}`}>{change.label}</span>
        <span className="mt-1 block text-sm leading-relaxed text-zinc-400">{change.text}</span>
      </span>
    </li>
  );
}

function ReleaseCard({ entry, compact = false }) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0d0f12]/85 p-5 shadow-2xl shadow-black/20">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/60 to-transparent" />
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-md border border-teal-300/20 bg-teal-300/10 px-2.5 py-1 text-xs font-semibold text-teal-100">
          <Radio size={13} />
          v{entry.version}
        </span>
        <time className="inline-flex items-center gap-2 text-xs text-zinc-500" dateTime={entry.dateISO}>
          <CalendarDays size={13} />
          {entry.date}
        </time>
      </div>

      <h2 className={`${compact ? 'mt-4 text-xl' : 'mt-5 text-2xl sm:text-3xl'} font-semibold leading-tight text-white`}>
        {entry.title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">{entry.summary}</p>

      {entry.changes?.length > 0 && (
        <ul className={`${compact ? 'mt-5' : 'mt-6'} space-y-3`}>
          {entry.changes.map((change, index) => (
            <ReleaseChange key={`${entry.version}-${change.label}-${index}`} change={change} />
          ))}
        </ul>
      )}
    </article>
  );
}

export default function UpdatesPage() {
  const navigate = useNavigate();
  const entries = changelogData.entries ?? [];
  const [activeFilter, setActiveFilter] = useState('all');
  const latest = entries[0];

  const stats = useMemo(
    () => ({
      releases: entries.length,
      newItems: countChanges(entries, 'Новое'),
      fixedItems: countChanges(entries, 'Исправлено'),
    }),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const historyEntries = entries.slice(1);
    if (activeFilter === 'all') return historyEntries;
    return historyEntries
      .map((entry) => ({
        ...entry,
        changes: (entry.changes || []).filter((change) => change.label === activeFilter),
      }))
      .filter((entry) => entry.changes.length > 0);
  }, [activeFilter, entries]);

  return (
    <AppShell hideHistory onOpenPricing={() => navigate('/pricing')}>
      <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden bg-[#07080a] text-zinc-200">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#07080a_0%,#0b1010_42%,#07080a_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />

        <main className="relative z-10 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <section className="mx-auto max-w-6xl px-5 pb-12 pt-10 sm:px-6 lg:pt-14">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(320px,0.42fr)] lg:items-end">
            <div>
              <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-teal-200/70">
                <span className="h-px w-9 bg-teal-300/60" />
                Журнал релизов
              </div>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] text-white sm:text-5xl">
                Что нового в Nexus AI
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400">
                Короткая история релизов: новые функции, улучшения продукта и исправления без лишней воды.
              </p>
            </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
              <div className="border-r border-white/10 p-4">
                <span className="block text-2xl font-semibold text-white">{stats.releases}</span>
                <span className="mt-1 block text-[11px] uppercase tracking-wide text-zinc-500">релизов</span>
              </div>
              <div className="border-r border-white/10 p-4">
                <span className="block text-2xl font-semibold text-emerald-200">{stats.newItems}</span>
                <span className="mt-1 block text-[11px] uppercase tracking-wide text-zinc-500">нового</span>
              </div>
              <div className="p-4">
                <span className="block text-2xl font-semibold text-amber-200">{stats.fixedItems}</span>
                <span className="mt-1 block text-[11px] uppercase tracking-wide text-zinc-500">фиксов</span>
              </div>
            </div>
          </div>

          <BrowserDownloadStrip className="mt-8" />

          {latest && (
            <div className="mt-9">
              <ReleaseCard entry={latest} />
            </div>
          )}
        </section>

        <section className="relative border-y border-white/[0.06] bg-black/15">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-white">История изменений</h2>
              <p className="mt-1 text-xs text-zinc-500">Фильтр меняет список ниже, последний релиз остаётся сверху.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => {
                const Icon = filter.icon;
                const active = activeFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActiveFilter(filter.id)}
                    className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${
                      active
                        ? 'border-teal-300/40 bg-teal-300/15 text-teal-100'
                        : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <Icon size={15} />
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
          {filteredEntries.length > 0 ? (
            <div className="relative">
              <div className="absolute bottom-8 left-[11px] top-8 w-px bg-white/10 sm:left-[18px]" />
              <div className="space-y-5">
                {filteredEntries.map((entry) => (
                  <div key={`${entry.version}-${entry.dateISO}-${activeFilter}`} className="relative pl-8 sm:pl-12">
                    <span className="absolute left-2 top-7 h-2.5 w-2.5 sm:left-3 sm:h-3 sm:w-3 rounded-full border border-teal-200/70 bg-[#07080a] ring-4 ring-teal-300/10" />
                    <ReleaseCard entry={entry} compact />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <p className="text-sm text-zinc-400">По этому фильтру пока нет записей.</p>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-teal-300/30 hover:text-teal-100"
              >
                Показать все
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </section>
        </main>
        <LegalFooter />
      </div>
    </AppShell>
  );
}
