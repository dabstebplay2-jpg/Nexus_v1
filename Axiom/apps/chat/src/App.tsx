import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Code2,
  Compass,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  modelKey,
  AXIOM_VERSION,
  textOf,
  type AppSettings,
  type Conversation,
  type Message,
  type MessagePart,
  type Model,
  type Provider,
} from '@axiom/shared';
import { api, stream } from './api';
import { Composer } from './components/Composer';
import { MessageView } from './components/MessageView';
import { Settings } from './components/Settings';
import { SerializedWriter } from './state/serialized-writer';
const prompts = [
  {
    icon: Sparkles,
    title: 'Дать идее форму',
    description: 'От первой мысли к ясному плану',
    text: 'Помоги превратить мою идею в план действий.',
  },
  {
    icon: Code2,
    title: 'Разобраться в коде',
    description: 'Понять, написать, улучшить',
    text: 'Покажи пример чистого TypeScript-кода и объясни его.',
  },
  {
    icon: BookOpen,
    title: 'Узнать что-то новое',
    description: 'Сложное — простыми словами',
    text: 'Объясни, как устроены большие языковые модели.',
  },
  {
    icon: Compass,
    title: 'Посмотреть иначе',
    description: 'Найти неожиданный подход',
    text: 'Предложи пять способов взглянуть на привычную задачу по-новому.',
  },
];
export function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ favoriteModels: [] });
  const [page, setPage] = useState<'chat' | 'settings'>('chat');
  const [sidebar, setSidebar] = useState(window.innerWidth > 760);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [parts, setParts] = useState<MessagePart[]>([]);
  const [editing, setEditing] = useState<string>();
  const generation = useRef<AbortController | null>(null);
  const generationStarted = useRef(false);
  const sending = useRef(false);
  const loadSequence = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const settingsRef = useRef(settings);
  const settingsRevision = useRef(0);
  const [settingsWriter] = useState(
    () =>
      new SerializedWriter<AppSettings>(
        (next) => api('/settings', 'PUT', next),
        (cause) =>
          setError(
            cause instanceof Error
              ? `${cause.message} Нажмите «Повторить», чтобы сохранить настройки.`
              : 'Не удалось сохранить настройки. Нажмите «Повторить».',
          ),
      ),
  );
  const selected = models.find((m) => modelKey(m) === settings.selectedModel) ?? models[0];
  const refresh = useCallback(async () => {
    const [nextModels, nextProviders, nextConversations] = await Promise.all([
      api<Model[]>('/models'),
      api<Provider[]>('/providers'),
      api<Conversation[]>('/conversations'),
    ]);
    setModels(nextModels);
    setProviders(nextProviders);
    setConversations(nextConversations);
  }, []);
  useEffect(() => {
    const revision = settingsRevision.current;
    void Promise.all([
      refresh(),
      api<AppSettings>('/settings').then((value) => {
        if (settingsRevision.current === revision) {
          settingsRef.current = value;
          setSettings(value);
        }
      }),
    ])
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить Axiom.'),
      )
      .finally(() => setLoading(false));
    return () => generation.current?.abort();
  }, [refresh]);
  useEffect(() => {
    if (follow.current && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);
  const saveSettings = (update: (previous: AppSettings) => AppSettings) => {
    const next = update(settingsRef.current);
    settingsRevision.current++;
    settingsRef.current = next;
    setSettings(next);
    settingsWriter.enqueue(next);
  };
  const openConversation = async (id: string) => {
    if (sending.current) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    setPage('chat');
    setEditing(undefined);
    setDraft('');
    setParts([]);
    try {
      const result = await api<{ messages: Message[] }>(`/conversations/${id}`);
      if (sequence !== loadSequence.current) return;
      setActive(id);
      setMessages(result.messages);
      follow.current = true;
      if (window.innerWidth <= 760) setSidebar(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось открыть диалог.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };
  const newChat = () => {
    if (sending.current) return;
    ++loadSequence.current;
    setLoading(false);
    setActive(undefined);
    setMessages([]);
    setDraft('');
    setParts([]);
    setEditing(undefined);
    setError('');
    setPage('chat');
    if (window.innerWidth <= 760) setSidebar(false);
  };
  const send = async (regenerate = false) => {
    if (!selected || sending.current || loading || (!regenerate && !draft.trim() && !parts.length))
      return;
    sending.current = true;
    setBusy(true);
    setError('');
    follow.current = true;
    const controller = new AbortController();
    generation.current = controller;
    generationStarted.current = false;
    let id = active;
    const oldDraft = draft;
    const oldParts = parts;
    const oldEditing = editing;
    let accepted = false;
    try {
      if (!id) {
        const conversation = await api<Conversation>('/conversations', 'POST');
        id = conversation.id;
        setActive(id);
        setConversations((previous) => [conversation, ...previous]);
      }
      controller.signal.throwIfAborted();
      const submitted = [
        ...(draft.trim() ? [{ type: 'text' as const, text: draft.trim() }] : []),
        ...parts,
      ];
      setDraft('');
      setParts([]);
      setEditing(undefined);
      if (regenerate)
        setMessages((previous) => {
          const index = previous.findLastIndex((m) => m.role === 'user');
          return previous.slice(0, index + 1);
        });
      else if (editing)
        setMessages((previous) =>
          previous.slice(
            0,
            previous.findIndex((m) => m.id === editing),
          ),
        );
      await stream(
        `/conversations/${id}/generate`,
        {
          providerId: selected.provider,
          modelId: selected.id,
          ...(regenerate ? { regenerate: true } : { parts: submitted, editMessageId: editing }),
        },
        controller.signal,
        (event) => {
          if (event.type === 'message') {
            generationStarted.current = true;
            accepted = true;
            setMessages((previous) => [
              ...previous.filter((m) => m.id !== event.message.id),
              event.message,
            ]);
          }
          if (event.type === 'delta')
            setMessages((previous) =>
              previous.map((m) =>
                m.id === event.messageId
                  ? { ...m, parts: [{ type: 'text', text: textOf(m) + event.text }] }
                  : m,
              ),
            );
          if (event.type === 'done')
            setMessages((previous) =>
              previous.map((m) => (m.id === event.message.id ? event.message : m)),
            );
          if (event.type === 'error') setError(event.message);
        },
      );
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Соединение с сервером прервано.');
      if (!accepted && !regenerate) {
        setDraft(oldDraft);
        setParts(oldParts);
        setEditing(oldEditing);
      }
    } finally {
      if (id) {
        try {
          const result = await api<{ messages: Message[] }>(`/conversations/${id}`);
          setMessages(result.messages);
          await refresh();
        } catch {
          setError(
            'Нет связи с сервером. Перезагрузите страницу после восстановления подключения.',
          );
        }
      }
      sending.current = false;
      setBusy(false);
      setAborting(false);
      generation.current = null;
    }
  };
  const stop = async () => {
    setAborting(true);
    if (!generationStarted.current || !active) {
      generation.current?.abort();
      return;
    }
    try {
      await api(`/conversations/${active}/stop`, 'POST');
    } catch {
      generation.current?.abort();
      setError('Связь с сервером потеряна. Поток остановлен на клиенте.');
    }
  };
  const rename = async (conversation: Conversation) => {
    const title = window.prompt('Название диалога', conversation.title)?.trim();
    if (!title) return;
    try {
      await api(`/conversations/${conversation.id}`, 'PATCH', { title });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось переименовать.');
    }
  };
  const remove = async (conversation: Conversation) => {
    if (!window.confirm(`Удалить диалог «${conversation.title}»?`)) return;
    try {
      await api(`/conversations/${conversation.id}`, 'DELETE');
      if (active === conversation.id) newChat();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить.');
    }
  };
  return (
    <div className="app-shell">
      {sidebar && <div className="sidebar-overlay" onClick={() => setSidebar(false)} />}
      <aside className={`sidebar ${sidebar ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <button className="brand" onClick={newChat} disabled={busy}>
            <span className="brand-symbol">Λ</span>Axiom<span className="brand-beta">BETA</span>
          </button>
          <button
            className="icon-button sidebar-close"
            aria-label="Скрыть боковую панель"
            onClick={() => setSidebar(false)}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <button className="new-chat" onClick={newChat} disabled={busy}>
          <Plus size={18} />
          Новый чат<span>↗</span>
        </button>
        <div className="history-label">
          ВАШИ ДИАЛОГИ<span>{conversations.length || ''}</span>
        </div>
        <nav className="history" aria-label="История диалогов">
          {conversations.length ? (
            conversations.map((c) => (
              <div
                className={`history-row ${active === c.id && page === 'chat' ? 'active' : ''}`}
                key={c.id}
              >
                <button
                  className="history-link"
                  disabled={busy}
                  onClick={() => {
                    void openConversation(c.id);
                  }}
                >
                  <MessageSquare size={15} />
                  <span>{c.title}</span>
                </button>
                <div className="history-actions">
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Переименовать ${c.title}`}
                    onClick={() => {
                      void rename(c);
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Удалить диалог ${c.title}`}
                    onClick={() => {
                      void remove(c);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="history-empty">
              Здесь появятся ваши разговоры.
              <br />
              Начните с любой мысли.
            </div>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-indicator" />
            <div>
              <strong>Личное пространство</strong>
              <span>История на этом компьютере</span>
            </div>
          </div>
          <button
            className={`settings-link ${page === 'settings' ? 'selected' : ''}`}
            disabled={busy}
            onClick={() => {
              setPage('settings');
              if (window.innerWidth <= 760) setSidebar(false);
            }}
          >
            <Settings2 size={17} />
            Настройки<span>v{AXIOM_VERSION}</span>
          </button>
          <div className="profile">
            <div className="avatar">A</div>
            <div>
              <strong>Ваш Axiom</strong>
              <span>Свобода выбирать</span>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <main className="main">
        {page === 'settings' ? (
          <Settings providers={providers} onRefresh={refresh} onClose={() => setPage('chat')} />
        ) : (
          <>
            <header className="chat-header">
              <div>
                {!sidebar && (
                  <button
                    className="icon-button"
                    aria-label="Открыть боковую панель"
                    onClick={() => setSidebar(true)}
                  >
                    <Menu size={19} />
                  </button>
                )}
                <span>
                  Axiom <strong>Chat</strong>
                </span>
                <span className="header-divider" />
                <span className="header-title">
                  {active ? conversations.find((c) => c.id === active)?.title : 'Новое начало'}
                </span>
              </div>
              <span className="private-label">
                <span />
                Локальная история
              </span>
            </header>
            {error && (
              <div className="global-error" role="alert">
                {error}
                <button
                  className="text-button"
                  onClick={() => {
                    setError('');
                    settingsWriter.retry();
                    void refresh().catch((cause) => setError(String(cause.message)));
                  }}
                >
                  Повторить
                </button>
                <button
                  className="icon-button"
                  aria-label="Скрыть ошибку"
                  onClick={() => setError('')}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <div
              className={`conversation-scroll ${!messages.length ? 'is-empty' : ''}`}
              ref={scrollRef}
              onScroll={() => {
                const element = scrollRef.current;
                if (element)
                  follow.current =
                    element.scrollHeight - element.scrollTop - element.clientHeight < 100;
              }}
            >
              {loading ? (
                <div className="loading-state">
                  <span className="loading-orbit" />
                  Открываем пространство…
                </div>
              ) : !messages.length ? (
                <section className="welcome">
                  <div className="welcome-emblem">
                    <span>Λ</span>
                    <i />
                  </div>
                  <div className="eyebrow">ПРОСТРАНСТВО ДЛЯ МЫСЛИ</div>
                  <h1>С чего начнём?</h1>
                  <p>
                    Большие идеи начинаются с простого вопроса.
                    <br />
                    Выберите направление или задайте своё.
                  </p>
                  <div className="prompt-grid">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt.title}
                        onClick={() => {
                          setDraft(prompt.text);
                          document.querySelector('textarea')?.focus();
                        }}
                      >
                        <prompt.icon size={20} />
                        <strong>
                          {prompt.title}
                          <ArrowUpRight size={15} />
                        </strong>
                        <span>{prompt.description}</span>
                      </button>
                    ))}
                  </div>
                  <div className="welcome-footnote">
                    <span />
                    Axiom Mock готов к работе. API-ключ не нужен.
                  </div>
                </section>
              ) : (
                <div className="message-list">
                  {messages.map((message, index) => (
                    <MessageView
                      key={message.id}
                      message={message}
                      busy={busy}
                      canRegenerate={index === messages.length - 1}
                      onEdit={(m) => {
                        setEditing(m.id);
                        setDraft(textOf(m));
                        setParts(m.parts.filter((p) => p.type !== 'text'));
                        document.querySelector('textarea')?.focus();
                      }}
                      onRegenerate={() => {
                        void send(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className={`composer-area ${!messages.length ? 'empty-composer' : ''}`}>
              <Composer
                value={draft}
                onChange={setDraft}
                parts={parts}
                onParts={setParts}
                onSend={() => {
                  void send();
                }}
                onStop={() => {
                  void stop();
                }}
                busy={busy}
                aborting={aborting}
                editing={!!editing}
                onCancelEdit={() => {
                  setEditing(undefined);
                  setDraft('');
                  setParts([]);
                }}
                models={models}
                providers={providers}
                selected={selected}
                favorites={settings.favoriteModels}
                onSelect={(model) =>
                  saveSettings((previous) => ({ ...previous, selectedModel: modelKey(model) }))
                }
                onFavorite={(key) =>
                  saveSettings((previous) => ({
                    ...previous,
                    favoriteModels: previous.favoriteModels.includes(key)
                      ? previous.favoriteModels.filter((k) => k !== key)
                      : [...previous.favoriteModels, key],
                  }))
                }
                onSettings={() => setPage('settings')}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
