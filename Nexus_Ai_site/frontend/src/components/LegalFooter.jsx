import { Link } from 'react-router-dom';
import { LEGAL } from '../config/legal';
import DiscordInviteLink from './DiscordInviteLink';

export default function LegalFooter({ className = '' }) {
  return (
    <footer
      className={`border-t border-white/5 py-8 px-6 text-sm text-zinc-500 ${className}`}
    >
      <div className="mx-auto max-w-4xl flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="text-zinc-400 font-medium text-white/90">{LEGAL.serviceName}</p>
          <p className="mt-1 text-xs">
            {LEGAL.merchantName} · ИНН {LEGAL.inn}
          </p>
          <p className="mt-1 text-xs">
            <a href={`mailto:${LEGAL.email}`} className="text-cyan-400/90 hover:text-cyan-300">
              {LEGAL.email}
            </a>
          </p>
        </div>
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs">
          <DiscordInviteLink className="text-indigo-300/90 hover:text-indigo-200" />
          <Link to="/ide/lite" className="hover:text-white transition-colors">
            IDE Web
          </Link>
          <Link to="/browser" className="hover:text-white transition-colors">
            Скачать Browser
          </Link>
          <Link to="/ide" className="hover:text-white transition-colors">
            Скачать IDE
          </Link>
          <Link to="/pricing" className="hover:text-white transition-colors">
            Тарифы
          </Link>
          <Link to="/updates" className="hover:text-white transition-colors">
            Изменения
          </Link>
          <Link to="/requisites" className="hover:text-white transition-colors">
            Реквизиты
          </Link>
          <Link to="/offer" className="hover:text-white transition-colors">
            Оферта
          </Link>
          <Link to="/privacy" className="hover:text-white transition-colors">
            Конфиденциальность
          </Link>
        </nav>
      </div>
      <p className="mx-auto max-w-4xl mt-6 text-center text-[11px] text-zinc-600">
        © {new Date().getFullYear()} {LEGAL.serviceName}. Оплата подписки — через ЮKassa.
      </p>
    </footer>
  );
}
