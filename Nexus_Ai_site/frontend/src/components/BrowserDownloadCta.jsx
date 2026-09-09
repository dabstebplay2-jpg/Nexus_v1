import { Link } from 'react-router-dom';
import { Download, Globe } from 'lucide-react';
import {
  BROWSER_PAGE_PATH,
  BROWSER_SETUP_URL,
  BROWSER_VERSION,
} from '../lib/browserDownload';

/** Крупные кнопки на главной / в hero */
export function BrowserDownloadHeroCta({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 ${className}`}>
      <a
        href={BROWSER_SETUP_URL}
        download
        className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-500/25 transition-colors"
      >
        <Download size={16} aria-hidden />
        Скачать Browser
        <span className="text-violet-300/80 font-normal hidden sm:inline">v{BROWSER_VERSION}</span>
      </a>
      <Link
        to={BROWSER_PAGE_PATH}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors"
      >
        <Globe size={16} aria-hidden />
        Подробнее
      </Link>
    </div>
  );
}

/** Компактная кнопка для шапки чата / меню */
export function BrowserDownloadPill({ className = '' }) {
  return (
    <a
      href={BROWSER_SETUP_URL}
      download
      className={`text-sm font-medium px-3 py-1.5 rounded-full border border-violet-500/35 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15 whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${className}`}
      title={`Nexus Browser v${BROWSER_VERSION} для Windows`}
    >
      <Download size={14} aria-hidden />
      Browser
    </a>
  );
}

/** Баннер под hero или на страницах */
export function BrowserDownloadStrip({ className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-violet-500/25 bg-gradient-to-r from-violet-500/10 via-transparent to-teal-500/5 px-4 py-4 sm:px-5 sm:flex sm:items-center sm:justify-between gap-3 ${className}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">Nexus Browser для Windows</p>
        <p className="text-xs text-zinc-400 mt-0.5">
          ИИ-панель, Shields, расширения Chrome — отдельное приложение v{BROWSER_VERSION}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        <a
          href={BROWSER_SETUP_URL}
          download
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Download size={15} />
          Setup.exe
        </a>
        <Link
          to={BROWSER_PAGE_PATH}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 text-sm font-medium text-zinc-200 px-3.5 py-2 hover:bg-white/5"
        >
          Все варианты
        </Link>
      </div>
    </div>
  );
}
