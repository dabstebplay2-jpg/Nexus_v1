import { useEffect, useMemo, useRef, useState } from 'react';

const CHATS_KEY = 'nexus-gpt-like-chats-v1';
const CURRENT_CHAT_KEY = 'nexus-gpt-like-current-chat-v1';
const MODEL_KEY = 'nexus-gpt-like-model-v1';

const welcomeMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Привет! Я Nexus. Напиши, что ты хочешь сделать — я помогу разложить задачу по шагам.',
};

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createChat(title = 'Новый чат') {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [{ ...welcomeMessage, id: createId() }],
    model: '',
  };
}

function loadInitialChats() {
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
    // ignore
  }

  const firstChat = createChat('Новый чат');

  return {
    chats: [firstChat],
    currentChatId: firstChat.id,
  };
}

function buildDialogContext(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-10)
    .map((message) => {
      const role = message.role === 'user' ? 'Пользователь' : 'Nexus';
      return `${role}: ${message.content}`;
    })
    .join('\n\n');
}

function buildNexusPrompt({ userText, messages }) {
  const dialogContext = buildDialogContext(messages);

  return `
Ты — Nexus AI. Ты простой no-code помощник внутри сайта.

Пользователь может ничего не понимать в сайтах, дизайне, UX, разработке и no-code. 
Твоя задача — не перегружать его, а самому превратить обычный запрос в понятный план.

Правила:
1. Отвечай простыми словами.
2. Не используй сложные термины без объяснения.
3. Сначала дай готовое решение по умолчанию.
4. Потом, если нужно, задай максимум 3 уточняющих вопроса.
5. Всегда давай следующий конкретный шаг.
6. Если пользователь просит сайт — дай структуру, блоки, тексты, UX-логику и no-code план.
7. Если пользователь просит лендинг — думай про заявку, доверие, оффер и CTA.
8. Если пользователь просит портфолио — помоги упаковать опыт, навыки и кейсы.
9. Если пользователь просит UX-аудит — найди проблемы и предложи исправления.
10. Если пользователь просит маркетплейсы — думай про карточку, SEO, визуал, рекламу и конверсию.

Контекст диалога:
${dialogContext || 'Это начало диалога.'}

Новый запрос пользователя:
${userText}

Формат ответа:
- Понял, делаем так
- Что я понял
- Что нужно сделать
- Готовый план
- Следующий шаг
`.trim();
}

export default function AiStudio() {
  const initialState = useMemo(() => loadInitialChats(), []);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chats, setChats] = useState(initialState.chats);
  const [currentChatId, setCurrentChatId] = useState(initialState.currentChatId);

  const [models, setModels] = useState([]);
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) || '');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const currentChat = useMemo(() => {
    return chats.find((chat) => chat.id === currentChatId) || chats[0];
  }, [chats, currentChatId]);

  const hasUserMessages = useMemo(() => {
    return (currentChat?.messages || []).some((message) => message.role === 'user');
  }, [currentChat]);

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
        const savedExists = loadedModels.some((item) => item.id === savedModel);

        if (savedModel && savedExists) {
          setModel(savedModel);
        } else if (loadedModels.length > 0) {
          setModel(loadedModels[0].id);
        } else {
          setModel('');
        }
      } catch (loadError) {
        setModels([]);
        setModel('');
        setModelsError(loadError.message || 'Ошибка загрузки моделей.');
      } finally {
        setModelsLoading(false);
      }
    }

    loadModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages, loading]);

  function updateCurrentChat(updater) {
    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== currentChatId) return chat;
        return updater(chat);
      })
    );
  }

  function handleNewChat() {
    const newChat = createChat('Новый чат');

    setChats((current) => [newChat, ...current]);
    setCurrentChatId(newChat.id);
    setInput('');
    setError('');
    setSidebarOpen(false);

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }

  function handleOpenChat(chatId) {
    setCurrentChatId(chatId);
    setInput('');
    setError('');
    setSidebarOpen(false);
  }

  function handleDeleteChat(chatId) {
    setChats((current) => {
      const filtered = current.filter((chat) => chat.id !== chatId);

      if (filtered.length === 0) {
        const freshChat = createChat('Новый чат');
        setCurrentChatId(freshChat.id);
        return [freshChat];
      }

      if (chatId === currentChatId) {
        setCurrentChatId(filtered[0].id);
      }

      return filtered;
    });
  }

  function handleClearHistory() {
    const freshChat = createChat('Новый чат');
    setChats([freshChat]);
    setCurrentChatId(freshChat.id);
    setInput('');
    setError('');
    setSidebarOpen(false);
  }

  async function sendMessage(event) {
    event?.preventDefault();

    const cleanInput = input.trim();

    if (!cleanInput || loading) return;

    if (!model) {
      setError('Модель не загружена. Проверь API-ключ и подключение к PolzaAI.');
      return;
    }

    const chatBeforeRequest = currentChat || createChat('Новый чат');

    const userMessage = {
      id: createId(),
      role: 'user',
      content: cleanInput,
    };

    const messagesAfterUser = [...chatBeforeRequest.messages, userMessage];

    updateCurrentChat((chat) => ({
      ...chat,
      title:
        chat.title === 'Новый чат'
          ? cleanInput.slice(0, 48)
          : chat.title,
      updatedAt: new Date().toISOString(),
      model,
      messages: messagesAfterUser,
    }));

    setInput('');
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetId: 'website',
          prompt: buildNexusPrompt({
            userText: cleanInput,
            messages: chatBeforeRequest.messages,
          }),
          context:
            'Nexus — простой чат-сайт с no-code AI-помощником. Интерфейс должен быть максимально простым: пользователь пишет задачу, ассистент помогает.',
          outputFormat: 'понятный структурированный ответ',
          tone: 'простыми словами, спокойно, без сложных терминов',
          model,
          maxOutputTokens: 2400,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.error) {
        throw new Error(data.message || 'Не удалось получить ответ.');
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
        messages: [...messagesAfterUser, assistantMessage],
      }));
    } catch (requestError) {
      const assistantError = {
        id: createId(),
        role: 'assistant',
        content:
          'Не получилось получить ответ. Проверь API-ключ, выбранную модель и доступность PolzaAI.',
        isError: true,
      };

      updateCurrentChat((chat) => ({
        ...chat,
        updatedAt: new Date().toISOString(),
        messages: [...messagesAfterUser, assistantError],
      }));

      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="gpt-app">
      <button
        className="sidebar-toggle"
        type="button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Открыть историю"
      >
        ☰
      </button>

      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Закрыть панель"
        />
      )}

      <aside className={`gpt-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span>N</span>
            <strong>Nexus</strong>
          </div>

          <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Закрыть">
            ×
          </button>
        </div>

        <button className="new-chat-button-gpt" type="button" onClick={handleNewChat}>
          + Новый чат
        </button>

        <div className="history-header-gpt">
          <span>История</span>
          <button type="button" onClick={handleClearHistory}>
            Очистить
          </button>
        </div>

        <div className="history-list-gpt">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`history-item-gpt ${chat.id === currentChatId ? 'is-active' : ''}`}
            >
              <button type="button" onClick={() => handleOpenChat(chat.id)}>
                {chat.title || 'Новый чат'}
              </button>

              <button
                className="delete-history-gpt"
                type="button"
                onClick={() => handleDeleteChat(chat.id)}
                aria-label="Удалить чат"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-status">
          {modelsLoading && <span>Загрузка модели...</span>}
          {!modelsLoading && model && <span>Модель подключена</span>}
          {modelsError && <span className="status-error">{modelsError}</span>}
        </div>
      </aside>

      <section className="gpt-main">
        <header className="gpt-topbar">
          <div>
            <strong>Nexus</strong>
            <span>{model || 'модель не выбрана'}</span>
          </div>
        </header>

        <div className={`chat-area ${hasUserMessages ? 'has-messages' : ''}`}>
          {!hasUserMessages && (
            <section className="empty-chat">
              <div className="empty-logo">N</div>
              <h1>Чем могу помочь?</h1>
            </section>
          )}

          <div className="messages-gpt">
            {(currentChat?.messages || []).map((message) => (
              <article
                key={message.id}
                className={`message-gpt ${message.role === 'user' ? 'is-user' : 'is-assistant'} ${
                  message.isError ? 'is-error' : ''
                }`}
              >
                <div className="message-inner-gpt">
                  {message.role === 'assistant' && <div className="avatar-gpt">N</div>}

                  <div className="bubble-gpt">
                    <pre>{message.content}</pre>
                  </div>
                </div>
              </article>
            ))}

            {loading && (
              <article className="message-gpt is-assistant">
                <div className="message-inner-gpt">
                  <div className="avatar-gpt">N</div>
                  <div className="bubble-gpt">
                    <div className="typing-dot-row">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              </article>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {error && <div className="gpt-error">{error}</div>}

        <form className="composer-gpt" onSubmit={sendMessage}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Спросите что-нибудь..."
            rows="1"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />

          <button type="submit" disabled={loading || !input.trim()}>
            ↑
          </button>
        </form>
      </section>
    </main>
  );
}