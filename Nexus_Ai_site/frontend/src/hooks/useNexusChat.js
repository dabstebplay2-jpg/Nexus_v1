import { useState, useCallback, useRef } from 'react';
import { mapChatError, isQuotaErrorMessage } from '../lib/chatErrors';
import { labelFromToolEvent, formatConnectorList } from '../features/connectors/connectorLabels';
import { streamSimpleChat, sendResearch, pickDefaultModel } from '../lib/chatApi';
import { ensureArray } from '../lib/normalizeArrays';
import { depthMeta } from '../lib/webSearchPreference';
import {
  augmentMessagesWithCodeContext,
  collectConversationCodeFiles,
  finalizeAssistantCodeFiles,
} from '../lib/conversationCodeFiles';
import { trimMessagesForContext } from '../lib/contextTrim';
import { collectConversationSources } from '../lib/collectConversationSources';
import { titleFromMessage, uid } from '../lib/chatStore';
import { attachmentsToApi, attachmentsForStorage, isImageGenModel } from '../lib/attachments';
import { persistImageList } from '../lib/imagePersistence';
import { createCodeArtifacts, createImageArtifact } from '../lib/artifactStore';
import { useArtifactsOptional } from '../context/ArtifactContext';
import { useUserMemoryOptional } from '../context/UserMemoryContext';
import { hasMemoryUpdateTrigger } from '../lib/memoryLearnTrigger';
import { createRafPatcher } from '../lib/streamPatch';

export function useNexusChat({
  authStatus,
  fetchProfile,
  tierHasAi,
  onNeedAuth,
  onNeedPricing,
  persistConversationNow,
}) {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const artifactsCtx = useArtifactsOptional();
  const userMemory = useUserMemoryOptional();

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async ({
      text,
      attachments = [],
      mode,
      selectedModel,
      selectedAgent,
      conversation,
      patchConv,
      ensureConversation,
      useContextTrim = false,
      contextLimit = 24,
      isMediaModel = false,
      assistantId: externalAssistantId,
      webSearchEnabled = false,
      webSearchDepth = 'standard',
      enableThinking = false,
    }) => {
      const trimmed = (text || '').trim();
      const hasAttachments = attachments.length > 0;
      if ((!trimmed && !hasAttachments) || loading) return null;
      if (!authStatus.authorized) {
        onNeedAuth?.();
        return null;
      }
      if (!tierHasAi(authStatus.profile?.subscription_tier)) {
        onNeedPricing?.();
        return null;
      }

      const convId = ensureConversation();
      const assistantId = externalAssistantId || uid();
      const userMsg = {
        role: 'user',
        content: trimmed || (hasAttachments ? 'См. вложения' : ''),
        at: Date.now(),
        attachments: attachmentsForStorage(attachments),
      };

      patchConv(convId, (c) => ({
        ...c,
        title: c.messages.length === 0 ? titleFromMessage(trimmed || 'Вложение') : c.title,
        messages: [...c.messages, userMsg],
        updatedAt: Date.now(),
      }));

      const conv = conversation || { messages: [] };
      const existingCodeFiles = collectConversationCodeFiles(conv.messages || []);
      let history = [...(conv.messages || []), userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      if (useContextTrim) {
        history = trimMessagesForContext(history, contextLimit);
      }
      const skipCodeContext = Boolean(isMediaModel);
      const apiMessages =
        mode === 'research'
          ? history
          : skipCodeContext
            ? history
            : augmentMessagesWithCodeContext(history, existingCodeFiles, trimmed);

      const webSearchPreference = webSearchEnabled && mode === 'chat';

      const placeholder = isMediaModel
        ? ''
        : mode === 'research'
          ? '🔬 Глубокое исследование…'
          : webSearchPreference
            ? 'Думаю…'
            : '';

      patchConv(convId, (c) => ({
        ...c,
        messages: [
          ...c.messages,
          {
            id: assistantId,
            role: 'assistant',
            content: placeholder,
            thinking: '',
            searchActivity:
              mode === 'chat' && webSearchPreference
                ? {
                    steps: [],
                    status: null,
                    depth: webSearchDepth,
                    depthLabel: depthMeta(webSearchDepth).label,
                  }
                : undefined,
            preSearchThinking: '',
            model: selectedModel,
            at: Date.now(),
            images: [],
            imageGenerating: Boolean(isMediaModel),
          },
        ],
      }));

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      setLoading(true);
      try {
        let reply = '';
        let sources = [];
        let replyImages = [];
        if (mode === 'research') {
          const data = await sendResearch({
            model: selectedModel,
            query: trimmed,
            messages: history.slice(0, -1),
            agentId: selectedAgent,
            depth: 'deep',
          });
          reply = data.reply || '';
          sources = ensureArray(data.sources);
        } else {
          let streamed = '';
          let thinkingStream = '';
          let preSearchThinking = '';
          let streamPhase = 'answer';
          let searchEngaged = false;
          let mediaToolEngaged = Boolean(isMediaModel);
          const connectorTools = [];
          const conversationSources = collectConversationSources(conv.messages || [], {
            excludeMessageId: assistantId,
          });
          const { schedule, flush } = createRafPatcher(patchConv, convId);

          const applyAssistant = () => {
            schedule((c) => ({
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== assistantId) return m;
                const hasAnswer = Boolean(streamed);
                const hasThink = Boolean(thinkingStream || preSearchThinking);
                let content = streamed;
                if (!hasAnswer) {
                  if (searchEngaged && !streamed) content = '';
                  else if (hasThink) content = '';
                  else content = placeholder;
                }
                return {
                  ...m,
                  thinking: thinkingStream || undefined,
                  preSearchThinking: preSearchThinking || undefined,
                  connectorTools: connectorTools.length ? [...connectorTools] : m.connectorTools,
                  content,
                  imageGenerating:
                    mediaToolEngaged && !(m.images && m.images.length > 0),
                };
              }),
              updatedAt: Date.now(),
            }));
          };

          const patchSearchActivity = (updater) => {
            schedule((c) => ({
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== assistantId) return m;
                const prev = m.searchActivity || {
                  steps: [],
                  depth: webSearchDepth,
                  depthLabel: depthMeta(webSearchDepth).label,
                };
                const next = updater(prev);
                return {
                  ...m,
                  content: streamed ? m.content : '',
                  searchActivity: next,
                };
              }),
              updatedAt: Date.now(),
            }));
          };

          const appendSearchStep = (evt) => {
            patchSearchActivity((prev) => {
              const steps = [...(prev.steps || [])];
              const phase = evt.phase || 'search';
              const round = evt.round;
              const maxRounds = evt.max_rounds;
              const sourcesTotal = evt.sources_total ?? 0;
              const queries = Array.isArray(evt.queries) ? evt.queries : [];

              if (phase === 'merge') {
                const prevTotal = steps.length
                  ? steps[steps.length - 1].sourcesTotal ?? 0
                  : 0;
                steps.push({
                  id: `merge-${round}-${steps.length}`,
                  phase: 'merge',
                  round,
                  maxRounds,
                  sourcesTotal,
                  added: Math.max(0, sourcesTotal - prevTotal),
                });
              } else {
                steps.push({
                  id: `search-${round}-${phase}-${steps.length}`,
                  phase,
                  round,
                  maxRounds,
                  queries,
                  sourcesTotal,
                });
              }
              return { ...prev, steps, status: null };
            });
          };

          const appendSearchPlan = (evt) => {
            patchSearchActivity((prev) => {
              const steps = [...(prev.steps || [])];
              steps.push({
                id: `analyze-${steps.length}`,
                phase: 'analyze',
                intent: evt.intent || '',
                queries: Array.isArray(evt.queries) ? evt.queries : [],
              });
              return { ...prev, steps, status: 'Анализирую запрос…' };
            });
          };

          const ensureReasonStep = () => {
            if (!preSearchThinking.trim()) return;
            patchSearchActivity((prev) => {
              const steps = prev.steps || [];
              if (steps.some((s) => s.phase === 'reason')) return prev;
              return {
                ...prev,
                steps: [
                  {
                    id: 'reason-0',
                    phase: 'reason',
                    intent: preSearchThinking.trim().slice(0, 400),
                  },
                  ...steps,
                ],
              };
            });
          };

          const apiAttachments = attachmentsToApi(attachments);
          const result = await streamSimpleChat({
            model: selectedModel,
            messages: apiMessages,
            attachments: apiAttachments,
            agentId: selectedAgent,
            useWebSearch: webSearchPreference,
            autoTools: webSearchPreference,
            webSearchDepth: webSearchPreference ? webSearchDepth : 'standard',
            conversationSources:
              conversationSources.length > 0 ? conversationSources : undefined,
            enableThinking,
            useConnectors: webSearchPreference,
            preferredImageModel: localStorage.getItem('nexus_default_media_model') || undefined,
            signal,
            onStatus: (status) => {
              if (status === 'image_generation') {
                mediaToolEngaged = true;
                schedule((c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: '', imageGenerating: true }
                      : m
                  ),
                  updatedAt: Date.now(),
                }));
                return;
              }
              if (status === 'search_skipped') {
                searchEngaged = false;
                patchSearchActivity((prev) => ({
                  ...prev,
                  steps: [],
                  status: null,
                }));
                return;
              }
              if (status === 'planning') {
                searchEngaged = true;
                streamPhase = 'pre';
                patchSearchActivity((prev) => ({
                  ...prev,
                  status: 'Планирую поиск…',
                }));
                return;
              }
              if (status === 'searching') {
                searchEngaged = true;
                streamPhase = 'search';
                ensureReasonStep();
                patchSearchActivity((prev) => ({
                  ...prev,
                  status: 'Ищу в интернете…',
                }));
                return;
              }
              if (status === 'search_ready') {
                streamPhase = 'answer';
                patchSearchActivity((prev) => ({
                  ...prev,
                  status: 'Формирую ответ по источникам…',
                }));
                return;
              }
              if (status === 'search_failed') {
                streamPhase = 'answer';
                patchSearchActivity((prev) => ({ ...prev, status: 'failed' }));
              }
            },
            onPreSearchDone: () => {
              if (!searchEngaged) return;
              ensureReasonStep();
            },
            onSearchPlan: (evt) => {
              if (!searchEngaged) return;
              appendSearchPlan(evt);
            },
            onSearchRound: (evt) => {
              if (!searchEngaged) return;
              appendSearchStep(evt);
            },
            onToolStart: (evt) => {
              const label = labelFromToolEvent(evt);
              if (!connectorTools.includes(label)) connectorTools.push(label);
              patchSearchActivity((prev) => ({
                ...prev,
                status: `Коннектор: ${label}…`,
              }));
              applyAssistant();
            },
            onToolEnd: (evt) => {
              const label = labelFromToolEvent(evt);
              patchSearchActivity((prev) => ({
                ...prev,
                status: label ? `Готово: ${label}` : null,
              }));
              applyAssistant();
            },
            onConnectorStatus: (evt) => {
              const list = Array.isArray(evt?.connectors) ? evt.connectors : [];
              const names = formatConnectorList(list);
              patchSearchActivity((prev) => ({
                ...prev,
                activeConnectors: list,
                status: names ? `Сервисы: ${names}` : 'Подключённые сервисы…',
              }));
            },
            onThinking: (chunk) => {
              if (streamPhase === 'pre') {
                preSearchThinking += chunk;
              } else {
                thinkingStream += chunk;
              }
              applyAssistant();
            },
            onToken: (token) => {
              streamed += token;
              applyAssistant();
            },
            onImage: (img) => {
              const ref = {
                url: img.dataUrl || img.url,
                dataUrl: img.dataUrl,
              };
              replyImages = [...replyImages, ref];
              schedule((c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: streamed || 'Изображение готово.',
                        images: [...(m.images || []), ref],
                        imageGenerating: false,
                      }
                    : m
                ),
                updatedAt: Date.now(),
              }));
            },
          });
          flush();
          replyImages = result.images?.length ? result.images : replyImages;
          let storedImages = await persistImageList(replyImages);
          if (storedImages.length) {
            storedImages = createImageArtifact({
              images: storedImages,
              chatId: convId,
              messageId: assistantId,
              prompt: trimmed,
            });
            artifactsCtx?.scheduleCloudSync?.();
          }
          const { incoming } = finalizeAssistantCodeFiles(
            conv.messages || [],
            streamed,
            existingCodeFiles
          );
          if (incoming.length) {
            createCodeArtifacts({
              codeFiles: incoming,
              chatId: convId,
              messageId: assistantId,
              prompt: trimmed,
            });
            artifactsCtx?.scheduleCloudSync?.();
          }
          let finalContent =
            streamed.trim() || (storedImages.length ? 'Изображение готово.' : '');
          if (!finalContent && thinkingStream.trim()) {
            finalContent = thinkingStream.trim();
          }
          const streamSources = Array.isArray(result.sources) ? result.sources : [];
          let convSnapshot = null;
          patchConv(convId, (c) => {
            const next = {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: finalContent,
                      thinking: thinkingStream || m.thinking,
                      preSearchThinking: preSearchThinking || m.preSearchThinking,
                      searchActivity: m.searchActivity
                        ? { ...m.searchActivity, status: null }
                        : m.searchActivity,
                      codeFiles: incoming.length ? incoming : m.codeFiles,
                      images: storedImages.length ? storedImages : m.images,
                      imageGenerating: false,
                      sources: streamSources.length ? streamSources : ensureArray(m.sources),
                      connectorTools: connectorTools.length ? connectorTools : m.connectorTools,
                      model: result.model || m.model,
                      toolsUsed: Array.isArray(result.tools_used) ? result.tools_used : m.toolsUsed,
                    }
                  : m
              ),
              updatedAt: Date.now(),
            };
            convSnapshot = next;
            return next;
          });
          if (convSnapshot && storedImages.length) {
            await persistConversationNow?.(convSnapshot);
          }
        }
        if (mode === 'research') {
          patchConv(convId, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantId ? { ...m, content: reply, sources: ensureArray(sources) } : m
            ),
            updatedAt: Date.now(),
          }));
        }
        if (hasMemoryUpdateTrigger(trimmed)) {
          userMemory?.refreshAfterLearn?.();
        }
        await fetchProfile?.();
        return { convId, assistantId };
      } catch (e) {
        const aborted = signal.aborted || e?.name === 'AbortError';
        const errText = mapChatError(e, { aborted });
        if (aborted) {
          patchConv(convId, (c) => ({
            ...c,
            messages: c.messages.map((m) => {
              if (m.id !== assistantId) return m;
              const partial = (m.content || '').trim();
              return {
                ...m,
                content: partial || '— Генерация остановлена.',
                searchActivity: m.searchActivity
                  ? { ...m.searchActivity, status: null }
                  : m.searchActivity,
                imageGenerating: false,
              };
            }),
            updatedAt: Date.now(),
          }));
          return null;
        }
        if (
          errText.includes('истекла') ||
          errText.includes('Войдите') ||
          errText.includes('авториз')
        ) {
          await fetchProfile?.();
          onNeedAuth?.();
        }
        const quotaHit = isQuotaErrorMessage(errText);
        if (quotaHit) {
          onNeedPricing?.();
        }
        const tierId = (authStatus.profile?.subscription_tier || 'FREE').toUpperCase();
        const topupRub = authStatus.profile?.topup_balance_rub ?? authStatus.profile?.balance_rub ?? 0;
        let quotaUpsell = '';
        if (quotaHit) {
          if (tierId === 'FREE') {
            quotaUpsell = ' Дневной лимит Free исчерпан — оформите Hobby в разделе «Тарифы».';
          } else if (!tierHasAi(tierId)) {
            quotaUpsell = ' Оформите подписку или пополните баланс в разделе «Тарифы».';
          } else if (topupRub <= 0) {
            quotaUpsell = ' Пополните баланс на странице «Тарифы» — можно без смены тарифа.';
          } else {
            quotaUpsell = ' Пополните баланс в «Тарифы» или дождитесь продления подписки.';
          }
        }
        const msg = `⚠️ ${errText}${quotaUpsell}`;
        patchConv(convId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId ? { ...m, content: msg } : m
          ),
        }));
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setLoading(false);
      }
    },
    [
      loading,
      authStatus,
      fetchProfile,
      tierHasAi,
      onNeedAuth,
      onNeedPricing,
      artifactsCtx,
      persistConversationNow,
    ]
  );

  return { loading, sendMessage, stopGeneration };
}
