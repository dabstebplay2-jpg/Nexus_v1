import { useEffect, useMemo, useRef, useState } from 'react';

const CHATS_KEY = 'nexus-chats-v2';
const CURRENT_CHAT_KEY = 'nexus-current-chat-v2';
const MODEL_KEY = 'nexus-selected-model-v2';

const navItems = [
  {
    id: 'chat',
    title: 'Чат',
    description: 'Главный AI-помощник',
  },
  {
    id: 'capabilities',
    title: 'Возможности',
    description: 'Что умеет Nexus',
  },
  {
    id: 'projects',
    title: 'Проекты',
    description: 'Будущие сайты и кейсы',
  },
  {
    id: 'settings',
    title: 'Настройки',
    description: 'Модель и режим работы',
  },
];

const tools = [
  {
    id: 'auto',
    title: 'Автоматически',
    presetId: 'website',
    description: 'Nexus сам поймёт, что нужно пользователю.',
  },
  {
    id: 'website',
    title: 'Сайт под ключ',
    presetId: 'website',
    description: 'Структура, блоки, тексты, UX и no-code план.',
  },
  {
    id: 'portfolio',
    title: 'Портфолио',
    presetId: 'caseStudy',
    description: 'Личный сайт, кейсы, навыки, опыт и контакты.',
  },
  {
    id: 'landing',
    title: 'Лендинг',
    presetId: 'copy',
    description: 'Продающая страница для услуги, рекламы или заявок.',
  },
  {
    id: 'ux',
    title: 'UX-аудит',
    presetId: 'uxAudit',
    description: 'Проверка логики, удобства, доверия и конверсии.',
  },
  {
    id: 'marketplace',
    title: 'Маркетплейсы',
    presetId: 'marketplace',
    description: 'WB/Ozon: карточки, SEO, визуал, реклама, аналитика.',
  },
];

const capabilities = [
  {
    title: 'Понимает обычный запрос',
    text: 'Можно написать: “хочу сайт для аренды квартиры” — Nexus сам предложит структуру, тексты, блоки и следующий шаг.',
  },
  {
    title: 'Собирает структуру сайта',
    text: 'Первый экран, преимущества, услуги, кейсы, отзывы, цены, контакты, CTA — всё раскладывается по понятным блокам.',
  },
  {
    title: 'Пишет тексты',
    text: 'Заголовки, подзаголовки, описания, кнопки, преимущества и текст для блоков сайта.',
  },
  {
    title: 'Думает как UX-дизайнер',
    text: 'Помогает понять, что пользователь увидит первым, где он может запутаться и что подтолкнёт его к заявке.',
  },
  {
    title: 'Даёт no-code план',
    text: 'Подсказывает, где лучше собрать сайт: Framer, Tilda, Webflow или другой инструмент, и что делать по шагам.',
  },
  {
    title: 'Помогает с портфолио',
    text: 'Упаковывает проекты в кейсы: задача, роль, процесс, решение, результат и выводы.',
  },
];

const starterPrompts = [
  'Хочу сделать сайт для себя. Помоги придумать структуру, стиль и блоки.',
  'Мне нужен лендинг для услуги. Сделай структуру и тексты.',
  'Хочу портфолио, но не знаю, что туда добавить.',
  'Сделай no-code план сайта для аренды квартиры.',
];

const initialAssistantMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Привет! Я Nexus. Просто напиши, какой сайт или digital-проект ты хочешь сделать. Не нужно разбираться в UX, дизайне, no-code или структуре — я сам разложу задачу по шагам.',
};

function createId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createNewChat(title = 'Новый чат') {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [{ ...initialAssistantMessage, id: createId() }],
    model: '',
  };
}

function getInitialState() {
  try {
    const savedChats = JSON.parse(localStorage.getItem(CHATS_KEY) || '[]');
    const savedCurrentId = localStorage.getItem(CURRENT_CHAT_KEY);

    if (Array.isArray(savedChats) && savedChats.length > 0) {
      const currentExists = savedChats.some((chat) => chat.id === savedCurrentId);

      return {
        chats: savedChats,
        currentChatId: currentExists ? savedCurrentId : savedChats[0].id,
      };
    }
  } catch {
    // ignore localStorage errors
  }

  const firstChat = createNewChat('Первый чат');

  return {
    chats: [firstChat],
    currentChatId: firstChat.id,
  };
}

function formatUsage(usage) {
  if (!usage) return '';
  const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const total = usage.total_tokens ?? input + output;

  return `tokens: ${total} · input: ${input} · output: ${output}`;
}

function formatChatContext(messages) {
  return messages
    .slice(-8)
    .map((message) => {
      const role = message.role === 'user' ? 'Пользователь' : 'Nexus';
      return `${role}: ${message.content}`;
    })
    .join('\n\n');
}

function buildPrompt({ userText, tool, chatMessages }) {
  const previousContext = formatChatContext(chatMessages);

  return `
Ты — Nexus AI. Ты no-code помощник для обычного пользователя, который может вообще ничего не понимать в сайтах, UX, дизайне, маркетинге и разработке.

Главная задача:
пользователь пишет простыми словами, а ты сам превращаешь это в понятный план сайта, текста, UX-структуры или no-code реализации.

Важные правила:
- Не заставляй пользователя разбираться в сложных терминах.
- Не перегружай ответ.
- Сначала дай готовое решение по умолчанию.
- Потом, если нужно, задай короткие уточняющие вопросы.
- Пиши так, будто пользователь новичок.
- Всегда давай следующий конкретный шаг.
- Если пользователь просит сайт, помоги собрать структуру, тексты, визуал и no-code план.
- Если пользователь просит портфолио, помоги упаковать его как специалиста.
- Если пользователь просит лендинг, думай про заявки, доверие и CTA.
- Если пользователь просит UX-аудит, найди проблемы и объясни, как исправить.
- Если пользователь просит маркетплейсы, думай про карточку, SEO, визуал, рекламу и конверсию.

Текущий режим:
${tool.title} — ${tool.description}

Контекст текущего диалога:
${previousContext || 'Пока контекста нет.'}

Новый запрос пользователя:
${userText}

Ответь в понятной структуре:
1. Что я понял
2. Что нужно сделать
3. Готовая структура / план
4. Тексты или примеры, если они нужны
5. Как это собрать без кода
6. Следующий шаг
`.trim();
}

export default function AiStudio() {
  const initialState = useMemo(() => getInitialState(), []);
  const [activePage, setActivePage] = useState('chat');
  const [activeToolId, setActiveToolId] = useState('auto');

  const [chats, setChats] = useState(initialState.chats);
  const [currentChatId, setCurrentChatId] = useState(initialState.currentChatId);

  const [models, setModels] = useState([]);
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) || '');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);

  const messagesEndRef = useRef(null);

  const currentChat = useMemo(() => {
    return chats.find((chat) => chat.id === currentChatId) || chats[0];
  }, [chats, currentChatId]);

  const activeTool = useMemo(() => {
    return tools.find((tool) => tool.id === activeToolId) || tools[0];
  }, [activeToolId]);

  useEffect(() => {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    if (currentChatId) {
      localStorage.setItem(CURRENT_CHAT_KEY, currentChatId);
    }
  }, [currentChatId]);

  useEffect(() => {
    if (model) {
      localStorage.setItem(MODEL_KEY, model);
    }
  }, [model]);

  useEffect(() => {
    async function loadModels() {
      setModelsLoading(true);
      setModelsError('');

      try {
        const response = await fetch('/api/models');
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.error) {
          throw new Error(data.message || 'Не удалось загрузить модели.');
        }

        const loadedModels = Array.isArray(data.models) ? data.models : [];
        setModels(loadedModels);

        const savedModel = localStorage.getItem(MODEL_KEY);
        const savedModelExists = loadedModels.some((item) => item.id === savedModel);

        if (savedModel && savedModelExists) {
          setModel(savedModel);
        } else if (loadedModels.length > 0) {
          setModel(loadedModels[0].id);
        } else {
          setModel('');
        }
      } catch (loadError) {
        setModelsError(loadError.message || 'Ошибка загрузки моделей.');
        setModels([]);
        setModel('');
      } finally {
        setModelsLoading(false);
      }
    }

    loadModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages, loading]);

  const handleNewChat = () => {
    const chat = createNewChat('Новый чат');

    setChats((current) => [chat, ...current]);
    setCurrentChatId(chat.id);
    setInput('');
    setError('');
    setMeta(null);
    setActivePage('chat');
  };

  const handleOpenChat = (chatId) => {
    setCurrentChatId(chatId);
    setInput('');
    setError('');
    setMeta(null);
    setActivePage('chat');
  };

  const handleDeleteChat = (chatId) => {
    setChats((current) => {
      const filtered = current.filter((chat) => chat.id !== chatId);

      if (filtered.length === 0) {
        const freshChat = createNewChat('Новый чат');
        setCurrentChatId(freshChat.id);
        return [freshChat];
      }

      if (chatId === currentChatId) {
        setCurrentChatId(filtered[0].id);
      }

      return filtered;
    });
  };

  const updateCurrentChat = (updater) => {
    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== currentChatId) return chat;

        return updater(chat);
      })
    );
  };

  const handleStarterPrompt = (promptText) => {
    setInput(promptText);
    setActivePage('chat');
  };

  const handleCopyLastAnswer = async () => {
    const lastAnswer = [...(currentChat?.messages || [])]
      .reverse()
      .find((message) => message.role === 'assistant' && message.id !== 'welcome');

    if (!lastAnswer) return;

    await navigator.clipboard.writeText(lastAnswer.content);
  };

  const sendMessage = async (event) => {
    event?.preventDefault();

    const cleanInput = input.trim();

    if (!cleanInput) {
      setError('Напиши задачу обычными словами. Например: “хочу сайт для бьюти-мастера”.');
      return;
    }

    if (!model) {
      setError('Сначала выбери модель. Если список моделей пустой — проверь API-ключ PolzaAI.');
      return;
    }

    const userMessage = {
      id: createId(),
      role: 'user',
      content: cleanInput,
    };

    const chatBeforeRequest = currentChat || createNewChat('Новый чат');
    const nextMessages = [...chatBeforeRequest.messages, userMessage];

    updateCurrentChat((chat) => ({
      ...chat,
      title:
        chat.title === 'Новый чат' || chat.title === 'Первый чат'
          ? cleanInput.slice(0, 48)
          : chat.title,
      updatedAt: new Date().toISOString(),
      model,
      messages: nextMessages,
    }));

    setInput('');
    setLoading(true);
    setError('');
    setMeta(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetId: activeTool.presetId,
          prompt: buildPrompt({
            userText: cleanInput,
            tool: activeTool,
            chatMessages: chatBeforeRequest.messages,
          }),
          context:
            'Nexus — простой no-code AI-сайт. Пользователь должен просто писать задачу, а сайт сам помогает с идеей, структурой, текстами, UX и планом реализации.',
          outputFormat: 'понятный ответ для новичка',
          tone: 'простыми словами, спокойно, уверенно, без сложных терминов',
          model,
          maxOutputTokens: 2200,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.error) {
        throw new Error(data.message || 'Не удалось получить ответ от нейросети.');
      }

      const assistantMessage = {
        id: createId(),
        role: 'assistant',
        content: data.answer,
      };

      updateCurrentChat((chat) => ({
        ...chat,
        updatedAt: new Date().toISOString(),
        model: data.model || model,
        messages: [...nextMessages, assistantMessage],
      }));

      setMeta(data);
    } catch (requestError) {
      const errorMessage = {
        id: createId(),
        role: 'assistant',
        content:
          'Не получилось получить ответ. Проверь API-ключ, выбранную модель и доступность PolzaAI API.',
        isError: true,
      };

      updateCurrentChat((chat) => ({
        ...chat,
        updatedAt: new Date().toISOString(),
        messages: [...nextMessages, errorMessage],
      }));

      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="nexus-app">
      <aside className="nexus-left-panel">
        <div className="nexus-brand">
          <div className="nexus-logo">N</div>
          <div>
            <strong>Nexus</strong>
            <span>No-code AI assistant</span>
          </div>
        </div>

        <button className="new-chat-button" type="button" onClick={handleNewChat}>
          + Новый чат
        </button>

        <nav className="site-nav">
          <p className="panel-label">Сайт</p>

          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`site-nav-item ${activePage === item.id ? 'is-active' : ''}`}
              onClick={() => setActivePage(item.id)}
            >
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </nav>

        <section className="chat-history-panel">
          <div className="history-header">
            <p className="panel-label">История чатов</p>
            <button type="button" onClick={() => setChats([])}>
              Очистить
            </button>
          </div>

          <div className="chat-history-list">
            {chats.length === 0 && <p className="empty-text">История пустая</p>}

            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`chat-history-item ${chat.id === currentChatId ? 'is-active' : ''}`}
              >
                <button type="button" onClick={() => handleOpenChat(chat.id)}>
                  <strong>{chat.title || 'Новый чат'}</strong>
                  <span>{chat.messages.length} сообщений</span>
                </button>

                <button
                  className="delete-chat-button"
                  type="button"
                  aria-label="Удалить чат"
                  onClick={() => handleDeleteChat(chat.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <section className="nexus-content">
        {activePage === 'chat' && (
          <section className="chat-page">
            <header className="chat-topbar">
              <div>
                <span className="page-badge">AI Chat</span>
                <h1>Что хочешь сделать?</h1>
                <p>Напиши обычными словами. Nexus сам разберётся, что нужно: сайт, лендинг, портфолио, UX или no-code план.</p>
              </div>

              <button type="button" onClick={handleCopyLastAnswer}>
                Скопировать последний ответ
              </button>
            </header>

            <div className="starter-grid">
              {starterPrompts.map((promptText) => (
                <button key={promptText} type="button" onClick={() => handleStarterPrompt(promptText)}>
                  {promptText}
                </button>
              ))}
            </div>

            <div className="chat-window">
              <div className="messages-list">
                {(currentChat?.messages || []).map((message) => (
                  <article
                    key={message.id}
                    className={`message-row ${message.role === 'user' ? 'is-user' : 'is-assistant'} ${
                      message.isError ? 'is-error' : ''
                    }`}
                  >
                    <div className="message-avatar">{message.role === 'user' ? 'You' : 'N'}</div>

                    <div className="message-bubble">
                      <pre>{message.content}</pre>
                    </div>
                  </article>
                ))}

                {loading && (
                  <article className="message-row is-assistant">
                    <div className="message-avatar">N</div>
                    <div className="message-bubble">
                      <p className="thinking-text">Nexus думает и собирает решение...</p>
                    </div>
                  </article>
                )}

                <div ref={messagesEndRef} />
              </div>

              {error && <div className="chat-alert">{error}</div>}

              {meta && (
                <div className="chat-meta-line">
                  <span>provider: {meta.provider}</span>
                  <span>model: {meta.model}</span>
                  <span>{formatUsage(meta.usage)}</span>
                </div>
              )}

              <form className="composer" onSubmit={sendMessage}>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Например: хочу сайт для аренды квартиры с отдельным входом, кухней и ванной..."
                  rows="3"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                />

                <button type="submit" disabled={loading || !model}>
                  {loading ? 'Думаю...' : 'Отправить'}
                </button>
              </form>
            </div>
          </section>
        )}

        {activePage === 'capabilities' && (
          <section className="info-page">
            <span className="page-badge">Возможности</span>
            <h1>Что умеет Nexus</h1>
            <p className="page-description">
              Nexus нужен не для того, чтобы пользователь разбирался в настройках. Он нужен, чтобы человек описал задачу, а сайт сам помог собрать решение.
            </p>

            <div className="info-grid">
              {capabilities.map((item) => (
                <article key={item.title} className="info-card">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {activePage === 'projects' && (
          <section className="info-page">
            <span className="page-badge">Проекты</span>
            <h1>Будущие проекты</h1>
            <p className="page-description">
              Здесь позже можно хранить созданные сайты, брифы, структуры, тексты и результаты генерации.
            </p>

            <div className="project-placeholder">
              <h3>Пока проекты не созданы</h3>
              <p>
                Начни с чата: напиши, какой сайт нужен, и Nexus подготовит основу. Потом этот результат можно будет превратить в отдельный проект.
              </p>
              <button type="button" onClick={() => setActivePage('chat')}>
                Перейти в чат
              </button>
            </div>
          </section>
        )}

        {activePage === 'settings' && (
          <section className="info-page settings-page">
            <span className="page-badge">Настройки</span>
            <h1>Настройки Nexus</h1>
            <p className="page-description">
              Эти настройки можно скрыть от обычного пользователя, но сейчас они нужны для разработки и проверки API.
            </p>

            <div className="settings-grid">
              <label className="setting-card">
                <span>Модель</span>

                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={modelsLoading || models.length === 0}
                >
                  {modelsLoading && <option value="">Загрузка моделей...</option>}
                  {!modelsLoading && models.length === 0 && <option value="">Модели не загружены</option>}

                  {!modelsLoading &&
                    models.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || item.id}
                      </option>
                    ))}
                </select>

                {modelsError && <small>{modelsError}</small>}
              </label>

              <label className="setting-card">
                <span>Режим по умолчанию</span>

                <select value={activeToolId} onChange={(event) => setActiveToolId(event.target.value)}>
                  {tools.map((tool) => (
                    <option key={tool.id} value={tool.id}>
                      {tool.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}