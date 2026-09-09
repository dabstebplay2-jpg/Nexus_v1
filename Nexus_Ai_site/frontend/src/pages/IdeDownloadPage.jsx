import { Link } from 'react-router-dom';
import {
  Download,
  Monitor,
  Puzzle,
  ArrowRight,
  Code2,
  Bot,
  Brain,
  Globe,
  Wrench,
  Package,
  CheckCircle2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { BROWSER_SETUP_URL, BROWSER_VERSION } from '../lib/browserDownload';
import { useState } from 'react';
import AppShell from '../components/layout/AppShell';

const DESKTOP_URL =
  import.meta.env.VITE_DESKTOP_DOWNLOAD_URL ||
  'https://github.com/nexus-ide/nexus-ide/releases/latest/download/NexusIDE-win32-x64.zip';

const RELEASES_PAGE = 'https://github.com/nexus-ide/nexus-ide/releases/latest';

const NEXUS_AI_ID = 'nexus.nexus-ai';
const NEXUS_AI_VERSION = import.meta.env.VITE_NEXUS_AI_VERSION || '1.8.0';

/** Прямая ссылка на VSIX (стабильный URL на том же домене, что и сайт). */
const NEXUS_AI_VSIX_URL =
  import.meta.env.VITE_NEXUS_AI_VSIX_URL || '/extensions/nexus-ai.vsix';

const NEXUS_AI_PAGE_URL = '/ide/extension/nexus-ai';

const BUNDLED = [
  { id: 'nexus.nexus-auth', name: 'Nexus Account', desc: 'Вход через Google, токены, профиль и синхронизация с сайтом.' },
  {
    id: 'nexus.nexus-billing',
    name: 'Nexus Billing',
    desc: 'Тариф, месячный пул ИИ, панель аккаунта в activity bar.',
  },
  {
    id: NEXUS_AI_ID,
    name: 'Nexus AI',
    desc: 'Облачный чат: стриминг, веб-поиск, мышление, агенты, режим агента с файлами и терминалом.',
    download: true,
  },
  { id: 'nexus.nexus-welcome', name: 'Nexus Welcome', desc: 'Первый запуск и рекомендуемые расширения OpenVSX.' },
];

const AI_FEATURES = [
  { icon: Bot, title: 'Режим агента', text: 'list_dir, read/write файлов, поиск по workspace, терминал с подтверждением.' },
  { icon: Brain, title: 'Мышление', text: 'Как на сайте: блок рассуждений над ответом для поддерживаемых моделей.' },
  { icon: Globe, title: 'Веб-поиск', text: 'Глубина quick / standard / deep, источники и память в диалоге.' },
  { icon: Wrench, title: 'Контекст IDE', text: 'Открытый файл, выделение, вложения, применение блоков кода в проект.' },
];

const INSTALL_STEPS = [
  'Скачайте VSIX Nexus AI (кнопка ниже) или установите Nexus IDE Desktop со встроенными расширениями.',
  'VSCodium / VS Code: Extensions → ⋯ → Install from VSIX… → выберите файл.',
  'Войдите: палитра → Nexus: Sign In with Google (тот же аккаунт, что на сайте).',
  'Панель Nexus → AI Chat: модель, при необходимости ⚡ Агент.',
];

function absoluteVsixUrl() {
  if (typeof window === 'undefined') return NEXUS_AI_VSIX_URL;
  if (NEXUS_AI_VSIX_URL.startsWith('http')) return NEXUS_AI_VSIX_URL;
  return `${window.location.origin}${NEXUS_AI_VSIX_URL}`;
}

export default function IdeDownloadPage() {
  const [copied, setCopied] = useState(false);
  const vsixAbsolute = absoluteVsixUrl();
  const pageAbsolute =
    typeof window !== 'undefined' ? `${window.location.origin}${NEXUS_AI_PAGE_URL}` : NEXUS_AI_PAGE_URL;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(vsixAbsolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <AppShell hideHistory>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar relative z-10 w-full overscroll-y-contain">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 pb-16">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-[11px] font-semibold text-teal-300 mb-4">
              <Package size={14} />
              Nexus IDE
            </span>
            <h1 className="text-3xl sm:text-4xl font-semibold text-[var(--nx-text)] mb-3">
              IDE Web или Desktop
            </h1>
            <p className="text-[var(--nx-muted)] text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              Браузер — быстрый старт с демо-проектом и Agent. Desktop — полный LSP, OpenVSX и терминал.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            <a
              href={BROWSER_SETUP_URL}
              download
              className="group rounded-2xl border-2 border-violet-500/40 bg-violet-500/10 p-6 text-left hover:border-violet-400/60 hover:bg-violet-500/15 transition-colors"
            >
              <div className="flex items-center gap-2 text-violet-200 font-semibold mb-2">
                <Globe size={22} />
                Скачать Nexus Browser
              </div>
              <p className="text-xs text-[var(--nx-muted)] leading-relaxed mb-4">
                Десктоп-браузер с ИИ-панелью, Shields и расширениями — Windows v{BROWSER_VERSION}.
              </p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-violet-100 group-hover:gap-2 transition-all">
                Setup.exe <ArrowRight size={16} />
              </span>
            </a>
            <Link
              to="/ide/lite"
              className="group rounded-2xl border-2 border-teal-500/40 bg-teal-500/10 p-6 text-left hover:border-teal-400/60 hover:bg-teal-500/15 transition-colors"
            >
              <div className="flex items-center gap-2 text-teal-300 font-semibold mb-2">
                <Code2 size={22} />
                Открыть IDE Web
              </div>
              <p className="text-xs text-[var(--nx-muted)] leading-relaxed mb-4">
                Редактор и Agent в браузере. Демо-проект на проде, полный workspace с локальным backend.
              </p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-teal-200 group-hover:gap-2 transition-all">
                Запустить <ArrowRight size={16} />
              </span>
            </Link>
            <a
              href="#download-vsix"
              className="group rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-6 text-left hover:border-[var(--nx-border)] hover:bg-[var(--nx-surface-hover)] transition-colors sm:col-span-2 lg:col-span-1"
            >
              <div className="flex items-center gap-2 text-[var(--nx-text)] font-semibold mb-2">
                <Download size={22} className="text-teal-400" />
                Скачать Desktop / VSIX
              </div>
              <p className="text-xs text-[var(--nx-muted)] leading-relaxed mb-4">
                VSCodium + расширения Nexus: LSP, отладчик, OpenVSX, реальный терминал.
              </p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--nx-muted)] group-hover:text-[var(--nx-text)] group-hover:gap-2 transition-all">
                К загрузкам <ArrowRight size={16} />
              </span>
            </a>
          </div>

          <section id="download-vsix" className="rounded-2xl border border-teal-500/35 bg-teal-500/5 p-5 mb-8 scroll-mt-8">
            <h2 className="text-base font-semibold text-[var(--nx-text)] mb-1 flex items-center gap-2">
              <Download size={18} className="text-teal-400" />
              Nexus AI · v{NEXUS_AI_VERSION}
            </h2>
            <p className="text-xs text-[var(--nx-muted)] mb-4 font-mono">{NEXUS_AI_ID}</p>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <a
                href={NEXUS_AI_VSIX_URL}
                download="nexus-ai.vsix"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--nx-text)] text-[var(--nx-bg)] text-sm font-semibold hover:opacity-90"
              >
                <Download size={18} />
                Скачать nexus-ai.vsix
              </a>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[var(--nx-border)] text-sm font-medium hover:bg-[var(--nx-surface-hover)]"
              >
                <Copy size={16} />
                {copied ? 'Ссылка скопирована' : 'Копировать прямую ссылку'}
              </button>
            </div>
            <p className="text-[11px] text-[var(--nx-muted)] break-all leading-relaxed">
              Прямая ссылка:{' '}
              <a href={NEXUS_AI_VSIX_URL} className="text-teal-400 hover:underline">
                {vsixAbsolute}
              </a>
            </p>
            <p className="text-[11px] text-[var(--nx-muted)] mt-2">
              Короткий путь на сайте:{' '}
              <Link to={NEXUS_AI_PAGE_URL} className="text-teal-400 hover:underline inline-flex items-center gap-1">
                {pageAbsolute} <ExternalLink size={12} />
              </Link>
              {' '}
              (тот же файл)
            </p>
          </section>

          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            {AI_FEATURES.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-4"
              >
                <Icon size={20} className="text-teal-400 mb-2" />
                <h2 className="font-semibold text-sm text-[var(--nx-text)] mb-1">{title}</h2>
                <p className="text-xs text-[var(--nx-muted)] leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5 mb-8">
            <h2 className="text-sm font-semibold text-[var(--nx-text)] mb-3 flex items-center gap-2">
              <Puzzle size={18} className="text-teal-400" />
              Встроенные расширения
            </h2>
            <ul className="space-y-3">
              {BUNDLED.map(({ id, name, desc, download }) => (
                <li key={id} className="text-xs border-b border-[var(--nx-border)] pb-3 last:border-0 last:pb-0">
                  <span className="font-mono text-[10px] text-teal-400/90">{id}</span>
                  <div className="font-semibold text-[var(--nx-text)] mt-0.5 flex items-center gap-2 flex-wrap">
                    {name}
                    {download ? (
                      <a
                        href={NEXUS_AI_VSIX_URL}
                        download="nexus-ai.vsix"
                        className="text-[10px] font-normal text-teal-400 hover:underline"
                      >
                        скачать VSIX
                      </a>
                    ) : null}
                  </div>
                  <p className="text-[var(--nx-muted)] mt-0.5 leading-relaxed">{desc}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5 mb-8">
            <h2 className="text-sm font-semibold text-[var(--nx-text)] mb-3">Установка</h2>
            <ol className="space-y-2.5">
              {INSTALL_STEPS.map((step, i) => (
                <li key={step} className="flex gap-2.5 text-xs text-[var(--nx-muted)] leading-relaxed">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-teal-500/15 text-teal-300 text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11px] text-[var(--nx-muted)] flex items-start gap-1.5">
              <CheckCircle2 size={14} className="text-teal-400 shrink-0 mt-0.5" />
              Тариф Hobby и выше — облачные модели и агент. Сначала установите{' '}
              <strong className="text-[var(--nx-text)]">nexus-auth</strong> (входит в Desktop или отдельный VSIX в
              релизах).
            </p>
          </section>

          <section className="rounded-2xl border border-dashed border-[var(--nx-border)] p-5 mb-6">
            <h2 className="text-sm font-semibold text-[var(--nx-text)] mb-2 flex items-center gap-2">
              <Monitor size={18} className="text-[var(--nx-muted)]" />
              Nexus IDE Desktop
            </h2>
            <p className="text-xs text-[var(--nx-muted)] mb-4 leading-relaxed">
              Code-OSS + OpenVSX: расширения Nexus уже встроены. Для обновления только AI — VSIX выше.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={DESKTOP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--nx-text)] text-[var(--nx-bg)] text-sm font-semibold hover:opacity-90"
              >
                <Download size={16} />
                Скачать Windows (ZIP)
              </a>
              <a
                href={RELEASES_PAGE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--nx-border)] text-[var(--nx-text)] text-sm font-medium hover:bg-[var(--nx-surface-hover)]"
              >
                Все релизы
                <ArrowRight size={14} />
              </a>
            </div>
          </section>

          <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-4 text-sm text-[var(--nx-muted)]">
            <strong className="text-[var(--nx-text)]">Web Lite</strong> — демо в браузере без OpenVSX.{' '}
            <Link to="/ide/lite" className="text-teal-500 hover:underline inline-flex items-center gap-1">
              <Code2 size={14} /> открыть Lite
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
