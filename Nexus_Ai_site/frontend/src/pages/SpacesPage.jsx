import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Boxes,
  ChevronLeft,
  Cloud,
  CloudOff,
  Clock3,
  FolderLock,
  MessageSquare,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { EmptyState, PageHero, ProductPage, SectionHeading, SurfaceCard } from '../components/ui/ProductPage';
import NexusComposer from '../components/layout/NexusComposer';
import ChatMessage from '../components/chat/ChatMessage';
import CodeArtifactPanel from '../components/chat/CodeArtifactPanel';
import { useChatCodePanel } from '../hooks/useChatCodePanel';
import { useCloudSpaceSync } from '../hooks/useCloudSpaceSync';
import DailyLimitBar from '../components/DailyLimitBar';
import {
  loadSpaceState,
  saveSpaceState,
  uid,
  conversationsForWorkspace,
} from '../lib/spaceStore';
import {
  fetchModels,
  pickDefaultModel,
  findModelById,
  formatModelShortName,
} from '../lib/chatApi';
import { pickDefaultMediaModel } from '../lib/modelCatalogHelpers';
import { useAuth } from '../context/AuthContext';
import { usePricingCatalog, tierHasAiFromList } from '../hooks/usePricingCatalog';
import { useNexusChat } from '../hooks/useNexusChat';
import { readWebSearchEnabled, writeWebSearchEnabled } from '../lib/webSearchPreference';
import { detectExplicitWebSearchIntent } from '../lib/webSearchIntent';
import { findModelByAnyId } from '../lib/modelSelection';
import { isImageGenModel, detectImageGenIntent } from '../lib/attachments';

export default function SpacesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authStatus, fetchProfile, openAuthModal, openSettingsModal } = useAuth();
  const { tiers } = usePricingCatalog();
  const [state, setState] = useState(loadSpaceState);
  const [input, setInput] = useState('');
  const [models, setModels] = useState([]);
  const [researchModels, setResearchModels] = useState([]);
  const [mediaModels, setMediaModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedAgent] = useState('quick');
  const [mode, setMode] = useState('chat');
  const [search, setSearch] = useState('');
  const [webSearch, setWebSearch] = useState(readWebSearchEnabled);
  const [webSearchHighlight, setWebSearchHighlight] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceEmoji, setWorkspaceEmoji] = useState('✨');
  const [pendingWorkspaceDelete, setPendingWorkspaceDelete] = useState(null);
  const messagesEndRef = useRef(null);
  const { cloudReady, cloudError, cloudEnabled } = useCloudSpaceSync({
    authorized: authStatus.authorized,
    userEmail: authStatus.profile?.email,
    state,
    setState,
  });

  const allModels = useMemo(
    () => [...models, ...researchModels, ...mediaModels],
    [models, researchModels, mediaModels]
  );
  const selectedModelMeta = useMemo(
    () => findModelByAnyId(allModels, selectedModel),
    [allModels, selectedModel]
  );
  const isMediaModelSelected = isImageGenModel(selectedModelMeta);

  const handleWebSearchChange = useCallback((next) => {
    setWebSearch(next);
    writeWebSearchEnabled(next);
  }, []);

  useEffect(() => {
    const settings = searchParams.get('settings');
    if (settings) {
      openSettingsModal(settings);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, openSettingsModal]);

  const wsConvs = conversationsForWorkspace(state.conversations, state.activeWorkspaceId);
  const activeConv = state.conversations.find((c) => c.id === state.activeConversationId);
  const activeWs = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  const inChat =
    Boolean(state.activeConversationId) &&
    activeConv?.workspaceId === state.activeWorkspaceId;

  useEffect(() => saveSpaceState(state), [state]);

  const loadCatalog = useCallback(async () => {
    if (!authStatus.authorized) return;
    try {
      const mData = await fetchModels();
      setModels(mData.models || []);
      setResearchModels(mData.research_models || mData.researchModels || []);
      setMediaModels(mData.media_models || mData.mediaModels || []);
      setSelectedModel((prev) => pickDefaultModel(mData.models, prev));
    } catch {
      /* ignore */
    }
  }, [authStatus.authorized]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages]);

  const patchConv = useCallback((convId, updater) => {
    setState((s) => ({
      ...s,
      conversations: s.conversations.map((c) => (c.id === convId ? updater(c) : c)),
    }));
  }, []);

  const ensureConversation = useCallback(() => {
    if (state.activeConversationId) {
      const c = state.conversations.find((x) => x.id === state.activeConversationId);
      if (c?.workspaceId === state.activeWorkspaceId) return c.id;
    }
    const id = uid();
    const conv = {
      id,
      workspaceId: state.activeWorkspaceId,
      title: 'Новый диалог',
      messages: [],
      model: selectedModel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setState((s) => ({
      ...s,
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
    }));
    return id;
  }, [state, selectedModel]);

  const { loading, sendMessage } = useNexusChat({
    authStatus,
    fetchProfile,
    tierHasAi: (id) => tierHasAiFromList(tiers, id),
    onNeedAuth: () => openAuthModal(),
    onNeedPricing: () => {
      if (authStatus.authorized) navigate('/pricing#topup');
      else openAuthModal();
    },
  });

  const { codePanel, openFromMessage, closePanel, selectFile } = useChatCodePanel(
    activeConv?.messages,
    { autoOpenWhileStreaming: true, streaming: loading }
  );

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');

    let finalModel = selectedModel;
    let finalIsMediaModel = isMediaModelSelected;

    if (detectImageGenIntent(text) && !isMediaModelSelected) {
      const defaultMediaId =
        pickDefaultMediaModel(mediaModels, localStorage.getItem('nexus_default_media_model')) ||
        'flux-klein';
      finalModel = defaultMediaId;
      finalIsMediaModel = true;
    }

    if (!webSearch && mode === 'chat' && detectExplicitWebSearchIntent(text)) {
      setWebSearchHighlight(true);
      window.setTimeout(() => setWebSearchHighlight(false), 2200);
    }

    await sendMessage({
      text,
      mode,
      selectedModel: finalModel,
      selectedAgent,
      isMediaModel: finalIsMediaModel,
      conversation: activeConv,
      patchConv,
      ensureConversation,
      useContextTrim: true,
      contextLimit: 24,
      webSearchEnabled: webSearch && mode === 'chat',
    });
  };

  const modelPool = mode === 'research' ? researchModels : models;

  const filteredWorkspaces = state.workspaces.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase())
  );

  const createConversation = useCallback(
    (workspaceId) => {
      const id = uid();
      setState((s) => ({
        ...s,
        activeWorkspaceId: workspaceId || s.activeWorkspaceId,
        conversations: [
          {
            id,
            workspaceId: workspaceId || s.activeWorkspaceId,
            title: 'Новый диалог',
            messages: [],
            model: selectedModel,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          ...s.conversations,
        ],
        activeConversationId: id,
      }));
    },
    [selectedModel]
  );

  const handleCreateWorkspace = (event) => {
    event.preventDefault();
    const name = workspaceName.trim();
    if (!name) return;
    const id = uid();
    setState((s) => ({
      ...s,
      workspaces: [
        ...s.workspaces,
        { id, name, emoji: workspaceEmoji || '✨', createdAt: Date.now() },
      ],
      activeWorkspaceId: id,
      activeConversationId: null,
    }));
    setWorkspaceName('');
    setWorkspaceEmoji('✨');
    setCreateOpen(false);
  };

  const confirmWorkspaceDelete = () => {
    if (!pendingWorkspaceDelete || state.workspaces.length <= 1) return;
    const workspaceId = pendingWorkspaceDelete.id;
    setState((s) => {
      const workspaces = s.workspaces.filter((workspace) => workspace.id !== workspaceId);
      const wasActive = s.activeWorkspaceId === workspaceId;
      return {
        ...s,
        workspaces,
        conversations: s.conversations.filter((conversation) => conversation.workspaceId !== workspaceId),
        activeWorkspaceId: wasActive ? workspaces[0].id : s.activeWorkspaceId,
        activeConversationId: wasActive ? null : s.activeConversationId,
      };
    });
    setPendingWorkspaceDelete(null);
  };

  const openPricing = () => navigate('/pricing');

  return (
    <>
      <AppShell
        hideHistory
        onOpenPricing={openPricing}
        onOpenSettings={(tab) => {
          if (tab === 'auth' || !tab) openAuthModal();
          else openSettingsModal(tab);
        }}
        headerRight={
          authStatus.authorized && (
            <div className="flex items-center gap-3 text-xs">
              <DailyLimitBar profile={authStatus.profile} compact className="w-36 hidden md:block" />
            </div>
          )
        }
      >
        {!inChat ? (
          <ProductPage>
            <PageHero
              eyebrow="Контекст для больших задач"
              icon={Boxes}
              title="Пространства Nexus"
              description="Собирайте связанные диалоги в одном месте. У каждого пространства своя история, рабочий контекст и быстрый переход к продолжению задачи."
              aside={
                <SurfaceCard className="grid grid-cols-2 divide-x divide-[var(--nx-border)]">
                  <div className="min-w-28 px-5 py-4 text-center"><strong className="block text-xl text-[var(--nx-text)]">{state.workspaces.length}</strong><span className="text-[10px] uppercase tracking-wide text-[var(--nx-muted)]">пространств</span></div>
                  <div className="min-w-28 px-5 py-4 text-center"><strong className="block text-xl text-[var(--nx-text)]">{state.conversations.length}</strong><span className="text-[10px] uppercase tracking-wide text-[var(--nx-muted)]">диалогов</span></div>
                  <div className="col-span-2 flex items-center justify-center gap-1.5 border-t border-[var(--nx-border)] px-4 py-2.5 text-[10px] text-[var(--nx-muted)]">
                    {!cloudReady ? <Loader2 size={12} className="animate-spin text-teal-300" /> : cloudEnabled ? <Cloud size={12} className="text-emerald-400" /> : <CloudOff size={12} />}
                    {!cloudReady ? 'Синхронизация…' : cloudEnabled ? 'Сохранено в аккаунте' : 'Сохранено на этом устройстве'}
                  </div>
                </SurfaceCard>
              }
            />

            {cloudError ? <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-xs leading-relaxed text-amber-100"><CloudOff size={16} className="mt-0.5 shrink-0" />{cloudError}</div> : null}

            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface-soft)] px-3 sm:w-72">
                <Search size={16} className="shrink-0 text-[var(--nx-muted)]" aria-hidden />
                <span className="sr-only">Поиск пространств</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Найти пространство…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--nx-text)] outline-none placeholder:text-[var(--nx-muted)]"
                />
                {search ? (
                  <button type="button" onClick={() => setSearch('')} aria-label="Очистить поиск" className="text-[var(--nx-muted)] hover:text-[var(--nx-text)]">
                    <X size={15} />
                  </button>
                ) : null}
              </label>
              <button type="button" className="nx-btn nx-btn--primary" onClick={() => setCreateOpen(true)}>
                <Plus size={17} aria-hidden />
                Новое пространство
              </button>
            </div>

            {filteredWorkspaces.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredWorkspaces.map((workspace, index) => {
                  const conversations = conversationsForWorkspace(state.conversations, workspace.id);
                  const latestConversation = conversations[0];
                  const active = workspace.id === state.activeWorkspaceId;
                  return (
                    <motion.div key={workspace.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.035 }}>
                      <SurfaceCard className={`group h-full p-5 ${active ? 'border-teal-400/40 ring-1 ring-teal-400/20' : ''}`} interactive>
                        <button
                          type="button"
                          onClick={() => setState((s) => ({ ...s, activeWorkspaceId: workspace.id, activeConversationId: null }))}
                          className="w-full text-left"
                          aria-pressed={active}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--nx-border)] bg-white/[0.04] text-2xl" aria-hidden>{workspace.emoji}</span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--nx-border)] px-2 py-1 text-[10px] text-[var(--nx-muted)]">
                              <FolderLock size={11} /> Приватное
                            </span>
                          </div>
                          <h2 className="mt-5 truncate text-base font-semibold text-[var(--nx-text)]">{workspace.name}</h2>
                          <div className="mt-2 flex items-center gap-3 text-xs text-[var(--nx-muted)]">
                            <span className="inline-flex items-center gap-1"><MessageSquare size={13} /> {conversations.length}</span>
                            {latestConversation ? (
                              <span className="inline-flex min-w-0 items-center gap-1 truncate"><Clock3 size={13} className="shrink-0" /> {new Date(latestConversation.updatedAt || latestConversation.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                            ) : (
                              <span>Новая область</span>
                            )}
                          </div>
                          <p className="mt-4 line-clamp-1 min-h-5 text-xs text-[var(--nx-muted)]">
                            {latestConversation?.title || 'Начните первый диалог в этом пространстве'}
                          </p>
                        </button>
                        <div className="mt-5 flex items-center gap-2 border-t border-[var(--nx-border)] pt-3">
                          <button type="button" onClick={() => createConversation(workspace.id)} className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-400/10 px-3 text-xs font-semibold text-teal-200 hover:bg-teal-400/15">
                            <Plus size={14} /> Новый диалог
                          </button>
                          {state.workspaces.length > 1 ? (
                            <button type="button" onClick={() => setPendingWorkspaceDelete(workspace)} className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--nx-muted)] hover:bg-red-400/10 hover:text-red-300" aria-label={`Удалить ${workspace.name}`}>
                              <Trash2 size={15} />
                            </button>
                          ) : null}
                        </div>
                      </SurfaceCard>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <SurfaceCard>
                <EmptyState icon={Search} title="Пространство не найдено" description="Проверьте название или очистите строку поиска." action={<button type="button" className="nx-btn nx-btn--secondary" onClick={() => setSearch('')}>Очистить поиск</button>} />
              </SurfaceCard>
            )}

            {activeWs ? (
              <section className="mt-12">
                <SectionHeading
                  title={`${activeWs.emoji} ${activeWs.name}`}
                  description="Последние диалоги выбранного пространства"
                  action={
                    <button type="button" className="nx-btn nx-btn--secondary" onClick={() => createConversation(activeWs.id)}>
                      <Plus size={16} /> Новый диалог
                    </button>
                  }
                />
                <SurfaceCard className="divide-y divide-[var(--nx-border)]">
                  {wsConvs.length > 0 ? wsConvs.slice(0, 8).map((conversation) => (
                    <button key={conversation.id} type="button" onClick={() => setState((s) => ({ ...s, activeConversationId: conversation.id }))} className="group flex w-full items-center gap-3 p-4 text-left hover:bg-white/[0.035]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-[var(--nx-muted)]"><MessageSquare size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-medium text-[var(--nx-text)]">{conversation.title}</strong>
                        <span className="mt-0.5 block text-[10px] text-[var(--nx-muted)]">{new Date(conversation.updatedAt || conversation.createdAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      </span>
                      <ArrowRight size={16} className="text-[var(--nx-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-teal-300" />
                    </button>
                  )) : (
                    <EmptyState icon={Sparkles} title="Здесь пока тихо" description="Начните диалог — Nexus будет хранить историю отдельно от остальных задач." action={<button type="button" className="nx-btn nx-btn--primary" onClick={() => createConversation(activeWs.id)}>Начать диалог <ArrowRight size={16} /></button>} />
                  )}
                </SurfaceCard>
              </section>
            ) : null}
          </ProductPage>
        ) : (
          <main className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--nx-border)] shrink-0">
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, activeConversationId: null }))}
                className="p-2 -ml-2 rounded-lg hover:bg-[var(--nx-surface-hover)] text-teal-400 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                aria-label="Назад к списку"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="min-w-0">
                <p className="font-medium text-sm text-[var(--nx-text)] truncate">
                  {activeWs?.emoji} {activeWs?.name}
                </p>
                <p className="text-[10px] text-[var(--nx-muted)] truncate">
                  контекст ~24 сообщений + глобальная память
                </p>
              </div>
            </div>
            <div className="flex flex-1 min-h-0 min-w-0 flex-col lg:flex-row">
              <div className="flex flex-col flex-1 min-w-0 min-h-0">
                <div className="nx-scroll-region custom-scrollbar">
                  {activeConv?.messages?.map((m, i) => {
                    const modelMeta =
                      m.role === 'assistant' && m.model
                        ? findModelById(modelPool, m.model)
                        : null;
                    const assistantLabel =
                      m.role === 'assistant'
                        ? formatModelShortName(modelMeta) || 'Nexus'
                        : undefined;
                    return (
                      <ChatMessage
                        key={m.id || i}
                        message={m}
                        isStreaming={loading}
                        assistantLabel={assistantLabel}
                        onOpenCodeFile={openFromMessage}
                        activeCodeFileId={codePanel.activeFileId}
                        codePanelOpen={codePanel.open}
                      />
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                <NexusComposer
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  loading={loading}
                  mode={mode}
                  onModeChange={setMode}
                  models={modelPool}
                  mediaModels={mediaModels}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  modelVariant={mode === 'research' ? 'research' : 'chat'}
                  disabled={!authStatus.authorized}
                  placeholder="Сообщение в пространстве…"
                  webSearch={webSearch}
                  onWebSearchChange={handleWebSearchChange}
                  webSearchHighlight={webSearchHighlight}
                />
              </div>
              {codePanel.open && codePanel.files.length > 0 && (
                <motion.div
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={0.1}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 100 || info.velocity.y > 500) closePanel();
                  }}
                  className="fixed inset-0 z-[60] flex flex-col bg-[var(--nx-bg)] lg:static lg:z-auto lg:flex lg:flex-1 lg:min-w-0 lg:max-w-[min(480px,45%)] border-l border-[var(--nx-border)]"
                >
                  <div className="lg:hidden flex justify-center py-2 shrink-0">
                    <div className="w-10 h-1 rounded-full bg-white/20" aria-hidden />
                  </div>
                  <CodeArtifactPanel
                    files={codePanel.files}
                    activeFileId={codePanel.activeFileId}
                    onSelectFile={selectFile}
                    onClose={closePanel}
                    streaming={loading}
                  />
                </motion.div>
              )}
            </div>
          </main>
        )}
      </AppShell>

      {createOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}
        >
          <form className="nx-panel w-full max-w-md p-5 sm:p-6" onSubmit={handleCreateWorkspace}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--nx-text)]">Новое пространство</h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--nx-muted)]">Дайте задаче короткое понятное название.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--nx-muted)] hover:bg-white/[0.06] hover:text-[var(--nx-text)]" aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <label className="mt-6 block text-xs font-medium text-[var(--nx-muted)]">
              Название
              <input autoFocus value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} maxLength={64} placeholder="Например, Новый сайт" className="mt-2 min-h-12 w-full rounded-xl border border-[var(--nx-border)] bg-black/20 px-3 text-sm text-[var(--nx-text)] outline-none placeholder:text-[var(--nx-muted)] focus:border-teal-400/50" />
            </label>
            <fieldset className="mt-5">
              <legend className="text-xs font-medium text-[var(--nx-muted)]">Иконка</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {['✨', '💻', '🚀', '🎨', '📚', '🧠', '📁', '🔬'].map((emoji) => (
                  <button key={emoji} type="button" onClick={() => setWorkspaceEmoji(emoji)} aria-pressed={workspaceEmoji === emoji} className={`flex h-11 w-11 items-center justify-center rounded-xl border text-lg transition-colors ${workspaceEmoji === emoji ? 'border-teal-400/50 bg-teal-400/10' : 'border-[var(--nx-border)] bg-white/[0.025] hover:bg-white/[0.05]'}`}>
                    {emoji}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="mt-7 flex justify-end gap-2">
              <button type="button" className="nx-btn nx-btn--secondary" onClick={() => setCreateOpen(false)}>Отмена</button>
              <button type="submit" className="nx-btn nx-btn--primary" disabled={!workspaceName.trim()}>
                Создать <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {pendingWorkspaceDelete ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingWorkspaceDelete(null); }}>
          <div className="nx-panel w-full max-w-md p-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="delete-space-title">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-400/10 text-red-300"><Trash2 size={20} /></span>
            <h2 id="delete-space-title" className="mt-4 text-lg font-semibold text-[var(--nx-text)]">Удалить пространство?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--nx-muted)]">«{pendingWorkspaceDelete.name}» и все его локальные диалоги будут удалены без возможности восстановления.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="nx-btn nx-btn--secondary" onClick={() => setPendingWorkspaceDelete(null)}>Отмена</button>
              <button type="button" className="nx-btn border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25" onClick={confirmWorkspaceDelete}>Удалить</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
