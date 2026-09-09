import {
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Gauge,
  Globe2,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  Monitor,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import DiscordInviteLink from '../components/DiscordInviteLink';
import { PageHero, ProductPage, SectionHeading, SurfaceCard } from '../components/ui/ProductPage';
import {
  BROWSER_VERSION,
  BROWSER_RELEASES_URL,
  BROWSER_SETUP_URL,
  BROWSER_PORTABLE_URL,
} from '../lib/browserDownload';

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: 'Nexus AI рядом',
    text: 'Откройте ИИ-панель, задайте вопрос по странице или продолжите диалог, не меняя вкладку.',
  },
  {
    icon: ShieldCheck,
    title: 'Спокойнее в интернете',
    text: 'Nexus Shields блокирует основную рекламу и трекеры и показывает состояние защиты.',
  },
  {
    icon: Gauge,
    title: 'Быстрый ежедневный браузер',
    text: 'Привычные горячие клавиши Chromium, группы вкладок и поддержка расширений Chrome Web Store.',
  },
];

const INSTALL_NOTES = [
  'Windows 10 или 11, 64-bit',
  'Ваши данные входа синхронизируются с Nexus AI',
  'Удаляется стандартно через настройки Windows',
];

export default function BrowserDownloadPage() {
  return (
    <AppShell hideHistory>
      <ProductPage>
        <PageHero
          eyebrow={`Nexus Browser ${BROWSER_VERSION}`}
          icon={Globe2}
          title="Браузер, в котором ИИ действительно под рукой"
          description="Отдельное приложение для Windows с Nexus AI, защитой от трекеров и привычным интерфейсом Chromium. Установите за пару минут или попробуйте portable-версию без установки."
          actions={
            <>
              <a className="nx-btn nx-btn--primary" href={BROWSER_SETUP_URL} download>
                <Download size={18} aria-hidden />
                Скачать для Windows
                <ArrowRight size={17} aria-hidden />
              </a>
              <a
                className="nx-btn nx-btn--secondary"
                href={BROWSER_RELEASES_URL}
                target="_blank"
                rel="noreferrer"
              >
                История версий
                <ExternalLink size={15} aria-hidden />
              </a>
            </>
          }
          aside={
            <SurfaceCard className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-teal-400/25 bg-teal-400/10 text-teal-300">
                  <Monitor size={22} aria-hidden />
                </span>
                <div>
                  <p className="text-xs text-[var(--nx-muted)]">Текущая версия</p>
                  <p className="text-lg font-semibold text-[var(--nx-text)]">v{BROWSER_VERSION}</p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-[var(--nx-muted)]">
                Это версия приложения Nexus Browser. Версия сайта обновляется отдельно.
              </p>
            </SurfaceCard>
          }
        />

        <section className="mb-12">
          <SectionHeading
            title="Выберите вариант установки"
            description="Оба файла ведут на последний официальный релиз Nexus Browser в GitHub Releases."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <SurfaceCard className="p-5 sm:p-6 border-teal-400/25" interactive>
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-400/10 text-teal-300">
                  <Download size={23} aria-hidden />
                </span>
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                  Рекомендуется
                </span>
              </div>
              <h2 className="mt-5 text-xl font-semibold text-[var(--nx-text)]">Установщик Windows</h2>
              <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-[var(--nx-muted)]">
                Добавит ярлык в меню «Пуск» и установит браузер в стандартную папку приложений.
              </p>
              <a className="nx-btn nx-btn--primary mt-6 w-full" href={BROWSER_SETUP_URL} download>
                <Download size={17} aria-hidden />
                NexusBrowser-{BROWSER_VERSION}-Setup.exe
              </a>
            </SurfaceCard>

            <SurfaceCard className="p-5 sm:p-6" interactive>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-300">
                <PackageOpen size={23} aria-hidden />
              </span>
              <h2 className="mt-5 text-xl font-semibold text-[var(--nx-text)]">Portable-версия</h2>
              <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-[var(--nx-muted)]">
                Один исполняемый файл без установки — удобно для теста, внешнего диска или второго профиля.
              </p>
              <a className="nx-btn nx-btn--secondary mt-6 w-full" href={BROWSER_PORTABLE_URL} download>
                <Download size={17} aria-hidden />
                Скачать Portable.exe
              </a>
            </SurfaceCard>
          </div>
        </section>

        <section className="mb-12">
          <SectionHeading
            title="Что уже встроено"
            description="Главные возможности работают сразу после входа в Nexus — без отдельной настройки API-ключей в браузере."
          />
          <div className="grid gap-3 md:grid-cols-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <SurfaceCard key={title} className="p-5" interactive>
                <Icon size={21} className="text-teal-300" aria-hidden />
                <h3 className="mt-4 text-sm font-semibold text-[var(--nx-text)]">{title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-[var(--nx-muted)]">{text}</p>
              </SurfaceCard>
            ))}
          </div>
        </section>

        <SurfaceCard className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-[var(--nx-text)]">Перед установкой</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
              {INSTALL_NOTES.map((note) => (
                <li key={note} className="flex items-start gap-2 text-xs leading-relaxed text-[var(--nx-muted)]">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
                  {note}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2 md:min-w-48">
            <a
              className="nx-btn nx-btn--secondary"
              href={BROWSER_RELEASES_URL}
              target="_blank"
              rel="noreferrer"
            >
              Все файлы релиза
              <ExternalLink size={15} aria-hidden />
            </a>
            <DiscordInviteLink className="nx-btn nx-btn--secondary">Задать вопрос в Discord</DiscordInviteLink>
          </div>
        </SurfaceCard>
      </ProductPage>
    </AppShell>
  );
}
