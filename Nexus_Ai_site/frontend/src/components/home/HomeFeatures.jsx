import { Link } from 'react-router-dom';
import { Bot, Cloud, GitBranch, Globe, Shield, Terminal, Zap } from 'lucide-react';

const ITEMS = [
  { icon: Cloud, title: 'Nexus Cloud', desc: 'Аккаунт, баланс и модели Polza.ai.' },
  { icon: Bot, title: 'ИИ в чате', desc: 'Research с источниками и вложениями.' },
  { icon: Globe, title: 'Nexus Browser', desc: 'Десктоп-браузер с ИИ и Shields — скачать для Windows.', to: '/browser' },
  { icon: Terminal, title: 'IDE Web', desc: 'Редактор и Agent в браузере — без установки.', to: '/ide/lite' },
  { icon: GitBranch, title: 'Git', desc: 'Статус и коммиты из IDE.' },
  { icon: Shield, title: 'Тарифы', desc: 'Free и платные планы с лимитами.' },
  { icon: Zap, title: 'Коннекторы', desc: 'Gmail, GitHub, Vercel и другие сервисы.' },
];

export default function HomeFeatures({ className = '' }) {
  return (
    <section id="features" className={`scroll-mt-28 ${className}`}>
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-6">
        Возможности
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map(({ icon: Icon, title, desc, to }) => {
          const inner = (
            <>
              <Icon className={`mb-2 ${title === 'Nexus Browser' ? 'text-violet-400' : 'text-teal-400'}`} size={20} aria-hidden />
              <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{desc}</p>
            </>
          );
          if (to) {
            return (
              <Link
                key={title}
                to={to}
                className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                  title === 'Nexus Browser'
                    ? 'border-violet-500/25 bg-violet-500/5 hover:border-violet-500/40 hover:bg-violet-500/10'
                    : 'border-teal-500/25 bg-teal-500/5 hover:border-teal-500/40 hover:bg-teal-500/10'
                }`}
              >
                {inner}
              </Link>
            );
          }
          return (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-left"
            >
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
