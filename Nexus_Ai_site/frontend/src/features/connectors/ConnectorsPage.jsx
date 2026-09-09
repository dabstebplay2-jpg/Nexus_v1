import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ConnectorCard from './ConnectorCard';
import DiscordWebhookModal from './DiscordWebhookModal';
import { useConnectors } from './useConnectors';
import { tierLabel } from './connectorTierLabels';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'connected', label: 'Подключено' },
  { id: 'available', label: 'Доступно' },
];

export default function ConnectorsPage({ compact = false }) {
  const navigate = useNavigate();
  const { authStatus, openAuthModal, openSettingsModal } = useAuth();
  const authorized = authStatus.authorized;
  const {
    connectors,
    loading,
    error,
    busyId,
    tierBlocksConnectors,
    userTier,
    oauthStatus,
    connect,
    disconnect,
    toggleChat,
    discordModalOpen,
    setDiscordModalOpen,
    submitDiscordWebhook,
  } = useConnectors({ enabled: authorized });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const oauthNotReady = oauthStatus && oauthStatus.mvp_oauth_ready === false;

  const handleUpgrade = (requiredTier) => {
    if (compact) {
      openSettingsModal?.('subscription');
      return;
    }
    navigate('/pricing', { state: { highlightTier: requiredTier || 'HOBBY' } });
  };

  const filtered = useMemo(() => {
    let list = connectors;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.id?.includes(q)
      );
    }
    if (filter === 'connected') list = list.filter((c) => c.connected);
    if (filter === 'available') list = list.filter((c) => c.available && !c.coming_soon);
    return list;
  }, [connectors, query, filter]);

  const connected = filtered.filter((c) => c.connected);
  const rest = filtered.filter((c) => !c.connected);

  const cardProps = {
    busy: busyId,
    onConnect: connect,
    onDisconnect: disconnect,
    onToggleChat: toggleChat,
    onUpgrade: handleUpgrade,
  };

  return (
    <div className={compact ? '' : 'max-w-5xl mx-auto'}>
      <header className={compact ? 'mb-4' : 'mb-8'}>
        <h1 className={compact ? 'text-lg font-bold text-white' : 'text-2xl font-bold text-white'}>
          Коннекторы
        </h1>
        <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
          Подключите сервисы, чтобы ИИ мог получать доступ к вашим данным и работать с ними в чате.
        </p>
        {authorized && (
          <p className="text-xs text-amber-200/80 mt-2 max-w-2xl">
            Для вызова инструментов в чате выбирайте модели с пометкой «Tools» в списке моделей.
          </p>
        )}
      </header>

      {!authorized ? (
        <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-6 text-center">
          <p className="text-sm text-zinc-400 mb-4">
            Войдите в аккаунт, чтобы подключать Gmail, GitHub, Vercel и Discord.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal()}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500"
          >
            Войти
          </button>
        </div>
      ) : (
        <>
          {tierBlocksConnectors && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-amber-100/90">
                Коннекторы доступны с тарифа <strong>Hobby</strong> и выше. Сейчас у вас{' '}
                <strong>{tierLabel(userTier)}</strong>.
              </p>
              <button
                type="button"
                onClick={() => handleUpgrade('HOBBY')}
                className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500"
              >
                Выбрать тариф
              </button>
            </div>
          )}

          {oauthNotReady && (
            <div className="mb-4 rounded-xl border border-zinc-500/30 bg-zinc-500/10 px-4 py-3">
              <p className="text-sm text-zinc-300">
                Часть подключений временно недоступна: для них завершается безопасная настройка входа.
                Доступные коннекторы можно подключать уже сейчас.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по всем коннекторам"
                className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                    filter === f.id
                      ? 'border-teal-500/50 bg-teal-500/15 text-teal-200'
                      : 'border-white/10 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="mb-4 text-sm text-red-400 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              {error}
            </p>
          )}

          {loading ? (
            <p className="text-sm text-zinc-500">Загрузка каталога…</p>
          ) : (
            <>
              {connected.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-zinc-400 mb-3">Подключено</h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {connected.map((c) => (
                      <ConnectorCard key={c.id} connector={c} {...cardProps} busy={busyId === c.id} />
                    ))}
                  </div>
                </section>
              )}
              {rest.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-zinc-400 mb-3">
                    {connected.length ? 'Каталог' : 'Все коннекторы'}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {rest.map((c) => (
                      <ConnectorCard key={c.id} connector={c} {...cardProps} busy={busyId === c.id} />
                    ))}
                  </div>
                </section>
              )}
              {!connected.length && !rest.length && (
                <p className="text-sm text-zinc-500">Ничего не найдено.</p>
              )}
            </>
          )}

          <DiscordWebhookModal
            open={discordModalOpen}
            busy={busyId === 'discord'}
            onClose={() => setDiscordModalOpen(false)}
            onSubmit={submitDiscordWebhook}
          />
        </>
      )}
    </div>
  );
}
