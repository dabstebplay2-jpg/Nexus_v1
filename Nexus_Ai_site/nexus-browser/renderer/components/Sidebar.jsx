import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { LogOut, X } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { fetchModels, parseBrowserTools, streamAgentChat, streamContextChat } from '../lib/api';

export default function Sidebar({
  authorized, onSignIn, onSignOut, profile, activeTabId, drawer = false, onClose,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [autoAgent, setAutoAgent] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [status, setStatus] = useState('');
  const [agentSteps, setAgentSteps] = useState([]);
  const confirmResolvers = useRef({});
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!authorized || !activeTabId) return;
    window.nexusBrowser.storage.chatGet(activeTabId).then((saved) => {
      if (saved?.length) setMessages(saved);
      else setMessages([]);
    });
  }, [authorized, activeTabId]);

  useEffect(() => {
    if (!authorized || !activeTabId || messages.length === 0) return;
    window.nexusBrowser.storage.chatSave(activeTabId, messages);
  }, [messages, authorized, activeTabId]);

  useEffect(() => {
    if (!authorized) return;
    fetchModels()
      .then((data) => {
        const list = data.models || data.research_models || [];
        setModels(list);
        const m = list[0]?.id || '';
        setModel(m);
      })
      .catch(() => {});
  }, [authorized]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentSteps, loading]);

  const runAgentTools = async (reply, userMsgs) => {
    const tools = parseBrowserTools(reply);
    for (const t of tools) {
      const stepId = String(Date.now()) + Math.random().toString().slice(2, 6);
      const newStep = { id: stepId, tool: t.tool, args: t.args || {}, status: autoAgent ? 'running' : 'pending_confirm', result: null };
      setAgentSteps((prev) => [...prev, newStep]);

      let confirmed = autoAgent;
      if (!autoAgent) {
        setStatus('Ожидание подтверждения…');
        confirmed = await new Promise((resolve) => { confirmResolvers.current[stepId] = resolve; });
      }
      if (!confirmed) {
        setAgentSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, status: 'denied' } : s)));
        continue;
      }
      setAgentSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, status: 'running' } : s)));
      const result = await window.nexusBrowser.agent.runTool(t.tool, t.args || {}, true);
      setAgentSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, status: 'completed', result } : s)));

      // Multi-turn: follow-up with tool result
      const followUp = [...userMsgs, { role: 'assistant', content: reply }, { role: 'user', content: `Результат ${t.tool}: ${JSON.stringify(result)}` }];
      let followReply = '';
      await streamAgentChat({
        model, messages: followUp, browser_agent: true, use_web_search: useWebSearch, use_connectors: false,
        page_context: await window.nexusBrowser.page.getContext(),
      }, {
        onToken: (tok) => { followReply += tok; },
        onStatus: (s) => setStatus(s),
        onError: (e) => setStatus(e),
      });
      if (followReply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: followReply }]);
      }
    }
  };

  const sendPrompt = async (text) => {
    if (!text || !authorized || !model) return;
    const userMsgs = [...messages, { role: 'user', content: text }];
    setMessages([...userMsgs, { role: 'assistant', content: '' }]);
    setLoading(true);
    setStatus('');
    setAgentSteps([]);

    const pageContext = await window.nexusBrowser.page.getContext();
    const body = {
      model,
      messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
      page_context: {
        url: pageContext.url,
        title: pageContext.title,
        excerpt: pageContext.excerpt,
        selection: pageContext.selection || null,
        tab_id: pageContext.tab_id,
      },
      browser_agent: agentMode,
      use_web_search: useWebSearch,
      use_connectors: false,
    };

    let reply = '';
    const streamFn = agentMode ? streamAgentChat : streamContextChat;

    try {
      await streamFn(body, {
        onToken: (t) => {
          reply += t;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: reply };
            return next;
          });
        },
        onThinking: () => setStatus('думаю…'),
        onStatus: (s) => setStatus(s),
        onError: (e) => setStatus(e),
      });

      if (agentMode) await runAgentTools(reply, userMsgs);
    } catch (e) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: `Ошибка: ${e.message}` };
        return next;
      });
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendPrompt(text);
  };

  const handleQuickAction = async (actionType) => {
    if (!authorized) return;
    const pageContext = await window.nexusBrowser.page.getContext();
    if (actionType === 'summarize') sendPrompt('Сделай краткую выжимку этой страницы.');
    else if (actionType === 'explain') {
      if (!pageContext.selection) { alert('Выделите текст на странице.'); return; }
      sendPrompt(`Объясни: "${pageContext.selection}"`);
    } else if (actionType === 'insights') sendPrompt('Ключевые тезисы страницы.');
  };

  const handleConfirmStep = (stepId, confirmed) => {
    if (confirmResolvers.current[stepId]) {
      confirmResolvers.current[stepId](confirmed);
      delete confirmResolvers.current[stepId];
    }
  };

  return (
    <aside className={`sidebar ${drawer ? 'sidebar--drawer' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-brand">
          <BrandLogo variant="icon" className="sidebar-brand__logo" imgClassName="sidebar-brand__img" alt="Nexus" />
          Nexus AI
        </span>
        <div className="toolbar">
          {drawer && (
            <button type="button" className="btn btn-sm btn-icon" onClick={onClose} title="Закрыть">
              <X size={14} />
            </button>
          )}
          {authorized && models.length > 0 && (
            <select className="model-select" value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
            </select>
          )}
          {!authorized ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onSignIn}>Войти</button>
          ) : (
            <button type="button" className="btn btn-sm btn-icon" onClick={onSignOut} title="Выйти"><LogOut size={14} /></button>
          )}
        </div>
      </div>

      {agentMode && (
        <div className="agent-banner">
          <span>Режим агента</span>
          <label><input type="checkbox" checked={autoAgent} onChange={(e) => setAutoAgent(e.target.checked)} /> Авто</label>
          <label><input type="checkbox" checked={useWebSearch} onChange={(e) => setUseWebSearch(e.target.checked)} /> Web</label>
        </div>
      )}

      {authorized && (
        <div className="quick-actions">
          <button type="button" className="quick-action-btn" onClick={() => handleQuickAction('summarize')}>Выжимка</button>
          <button type="button" className="quick-action-btn" onClick={() => handleQuickAction('explain')}>Объяснить</button>
          <button type="button" className="quick-action-btn" onClick={() => handleQuickAction('insights')}>Тезисы</button>
        </div>
      )}

      <div className="chat-messages">
        {!authorized ? (
          <div className="sidebar-empty">
            <BrandLogo variant="icon" className="sidebar-empty__logo" imgClassName="sidebar-empty__img" alt="Nexus" />
            <p className="muted">Войдите в Nexus для ИИ-ассистента и агента.</p>
            <button type="button" className="btn btn-primary" onClick={onSignIn}>Войти через Google</button>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.role === 'assistant' ? <ReactMarkdown>{m.content || '…'}</ReactMarkdown> : m.content}
              </div>
            ))}
            {agentSteps.map((step) => (
              <div key={step.id} className="agent-step">
                <div className="agent-step-header">
                  <span>{step.tool}</span>
                  <span className={`step-status step-${step.status}`}>{step.status}</span>
                </div>
                {step.status === 'pending_confirm' && (
                  <div className="step-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleConfirmStep(step.id, true)}>Разрешить</button>
                    <button type="button" className="btn btn-sm" onClick={() => handleConfirmStep(step.id, false)}>Отклонить</button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
        {status && <p className="muted status-line">{status}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-composer">
        <textarea
          className="chat-input"
          placeholder={authorized ? 'Спросите о странице…' : 'Сначала войдите'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!authorized || loading}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button type="button" className="btn btn-primary btn-icon" disabled={!authorized || loading} onClick={handleSend}>→</button>
      </div>

      <div className="sidebar-footer">
        <button type="button" className={`btn btn-sm ${agentMode ? 'btn-primary' : ''}`} onClick={() => setAgentMode((v) => !v)}>
          {agentMode ? 'Агент: ВКЛ' : 'Включить агента'}
        </button>
      </div>
    </aside>
  );
}
