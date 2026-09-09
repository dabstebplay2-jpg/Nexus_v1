import { apiFetch } from './apiClient';
import { throwIfQuotaHttpError } from './quotaErrors';
import { apiStreamFetch, consumeSseResponse } from './apiStream';
import {
  resolveModelId,
  isThinkingEnabled,
  loadThinkingPrefs,
  findModelByAnyId,
} from './modelSelection';
import { asArray, normalizeVisionGuide } from './normalizeArrays';

export async function fetchModels() {
  const res = await apiFetch('/ai/models');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось загрузить модели');
  }
  const data = await res.json();
  return {
    ...data,
    models: asArray(data.models),
    researchModels: asArray(data.research_models),
    mediaModels: asArray(data.media_models),
    visionGuide: normalizeVisionGuide(data.vision_guide),
  };
}

export const SEGMENT_ORDER = ['cheap', 'medium', 'expensive', 'very_expensive'];
export const SEGMENT_LABELS = {
  cheap: 'Hobby и выше',
  medium: 'Standard и выше',
  expensive: 'Pro и выше',
  very_expensive: 'Ultra',
};

/** Короткое имя для UI */
export function formatModelShortName(model, thinkingEnabled = false) {
  if (!model) return 'Модель';
  if (model.display_name) {
    const base = model.display_name;
    if (thinkingEnabled && model.supports_thinking) return `${base} · мышление`;
    return base;
  }
  const id = (model.id || '').toLowerCase();
  const map = [
    [/gpt-5\.5-pro/, 'GPT-5.5 Pro'],
    [/gpt-5\.5/, 'GPT-5.5'],
    [/gpt-5\.4-pro/, 'GPT-5.4 Pro'],
    [/gpt-5\.4-nano/, 'GPT-5.4 nano'],
    [/gpt-5\.4-mini/, 'GPT-5.4 mini'],
    [/gpt-5\.4/, 'GPT-5.4'],
    [/claude-opus-4\.8/, 'Claude Opus 4.8'],
    [/claude-sonnet-4\.6/, 'Claude Sonnet 4.6'],
    [/claude-haiku-4\.5/, 'Claude Haiku 4.5'],
    [/gemini-3\.1-pro/, 'Gemini 3.1 Pro'],
    [/gemini-3\.5-flash/, 'Gemini 3.5 Flash'],
    [/gemini-3\.1-flash-lite/, 'Gemini 3.1 Flash Lite'],
    [/gemini-3-flash/, 'Gemini 3 Flash'],
    [/deepseek-v4-flash/, 'DeepSeek V4 Flash'],
    [/deepseek-v4-pro/, 'DeepSeek V4 Pro'],
    [/kimi-k2\.6/, 'Kimi K2.6'],
    [/sonar-deep-research/, 'Sonar Deep Research'],
    [/sonar-reasoning/, 'Sonar Reasoning'],
    [/sonar-pro/, 'Sonar Pro'],
    [/sonar/, 'Sonar'],
  ];
  for (const [re, label] of map) {
    if (re.test(id)) {
      return thinkingEnabled && model.supports_thinking ? `${label} · мышление` : label;
    }
  }
  const tail = (model.id || '').split('/').pop() || model.name;
  return tail.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 28);
}

export function groupModelsBySegment(models) {
  const map = new Map();
  for (const m of models || []) {
    const seg = m.cost_segment || 'medium';
    if (!map.has(seg)) map.set(seg, []);
    map.get(seg).push(m);
  }
  return SEGMENT_ORDER.filter((s) => map.has(s)).map((seg) => ({
    segment: seg,
    label: SEGMENT_LABELS[seg] || seg,
    models: map.get(seg),
  }));
}

export async function fetchAgents() {
  const res = await apiFetch('/ai/agents');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось загрузить агентов');
  }
  return res.json();
}

export async function streamSimpleChat({
  model,
  messages,
  attachments,
  agentId,
  useWebSearch = false,
  autoTools = true,
  webSearchDepth = 'standard',
  conversationSources,
  enableThinking = false,
  onThinking,
  onToken,
  onImage,
  onStatus,
  onSearchRound,
  onSearchPlan,
  onPreSearchDone,
  onToolStart,
  onToolEnd,
  onConnectorStatus,
  onDone,
  signal,
  useConnectors = true,
  preferredImageModel,
}) {
  const body = {
    model,
    messages,
    attachments: attachments?.length ? attachments : undefined,
    agent_id: agentId || undefined,
    use_web_search: Boolean(useWebSearch),
    auto_tools: Boolean(autoTools),
    web_search_depth: useWebSearch ? webSearchDepth || 'standard' : 'standard',
    enable_thinking: Boolean(enableThinking),
    use_connectors: Boolean(useConnectors),
    preferred_image_model: preferredImageModel || undefined,
  };
  if (conversationSources?.length) {
    body.conversation_sources = conversationSources;
  }
  const res = await apiStreamFetch('/ai/chat/simple/stream', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = typeof err.detail === 'string' ? err.detail : 'Ошибка чата';
    if (res.status === 401) throw new Error(detail || 'Сессия истекла. Войдите снова.');
    throwIfQuotaHttpError(res, detail);
    throw new Error(detail);
  }
  let result = null;
  const stats = await consumeSseResponse(res, {
    onThinking,
    onToken,
    onImage,
    onStatus,
    onSearchRound,
    onSearchPlan,
    onPreSearchDone,
    onToolStart,
    onToolEnd,
    onConnectorStatus,
    onDone: (data) => {
      result = data;
      onDone?.(data);
    },
    onError: (msg) => {
      throw new Error(msg);
    },
  });
  if (!stats.done) {
    throw new Error(
      'Соединение оборвалось до конца ответа. Повторите запрос или временно отключите «Автоинструменты».'
    );
  }
  const hasAnswer =
    stats.tokens > 0 ||
    result?.had_tokens ||
    (result?.images?.length ?? 0) > 0 ||
    stats.thinking > 0 ||
    result?.had_thinking;
  if (!hasAnswer) {
    throw new Error(
      'Модель не вернула результат. Попробуйте другую модель или отключите «Автоинструменты».'
    );
  }
  return {
    reply: '',
    model: result?.model || model,
    billing: result?.billing,
    images: result?.images || [],
    sources: result?.sources || [],
    search_engine: result?.search_engine,
    had_thinking: result?.had_thinking,
    tools_used: result?.tools_used || [],
  };
}

export async function sendSimpleChat({ model, messages, agentId }) {
  const res = await apiFetch('/ai/chat/simple', {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages,
      agent_id: agentId || undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = typeof err.detail === 'string' ? err.detail : 'Ошибка чата';
    if (res.status === 401) throw new Error(detail || 'Сессия истекла. Войдите снова.');
    throwIfQuotaHttpError(res, detail);
    throw new Error(detail);
  }
  return res.json();
}

export async function sendResearch({ model, query, messages, agentId, depth = 'deep' }) {
  const res = await apiFetch('/ai/research', {
    method: 'POST',
    body: JSON.stringify({
      model,
      query,
      messages: messages || [],
      agent_id: agentId || undefined,
      depth,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = typeof err.detail === 'string' ? err.detail : 'Ошибка Research';
    if (res.status === 401) throw new Error(detail || 'Сессия истекла. Войдите снова.');
    throwIfQuotaHttpError(res, detail);
    throw new Error(detail);
  }
  return res.json();
}

export {
  modelLockHint,
  sortModelsUnlockedFirst,
  pickDefaultMediaModel,
} from './modelCatalogHelpers';

export function pickDefaultModel(models, preferredId) {
  if (!models?.length) return '';
  const unlocked = models.filter((m) => !m.locked);
  if (!unlocked.length) return '';
  const prefs = loadThinkingPrefs();
  if (preferredId) {
    const pref = findModelByAnyId(unlocked, preferredId);
    if (pref) return resolveModelId(pref, isThinkingEnabled(pref, prefs));
  }
  const byNewest = [...unlocked].sort((a, b) => (b.created || 0) - (a.created || 0));
  const first = byNewest[0];
  return resolveModelId(first, isThinkingEnabled(first, prefs));
}

export async function refreshModelsCatalog() {
  const res = await apiFetch('/ai/models/refresh', {
    method: 'POST',
    body: '{}',
  });
  if (!res.ok) throw new Error('Не удалось обновить каталог');
  return res.json();
}

export function getModelProvider(m) {
  if (m.provider) return m.provider;
  const id = m.id || '';
  const slug = id.includes('/') ? id.split('/')[0] : id;
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Other';
}

export function formatModelOptionLabel(m) {
  const tier = m.min_tier ? ` · ${m.min_tier}` : '';
  const fresh = m.is_latest ? ' ✦' : '';
  return `${m.name}${tier}${fresh}`;
}

/** Модели, сгруппированные по компании (провайдеру), отсортированные A→Z */
export function groupModelsByProvider(models) {
  if (!models?.length) return [];
  const map = new Map();
  for (const m of models) {
    const provider = getModelProvider(m);
    if (!map.has(provider)) map.set(provider, []);
    map.get(provider).push(m);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ru', { sensitivity: 'base' }))
    .map(([provider, items]) => ({
      provider,
      models: [...items].sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id, 'ru', { sensitivity: 'base' })
      ),
    }));
}

export function findModelById(models, id) {
  return findModelByAnyId(models, id);
}

/** Сохранить prev, если он есть в полном каталоге (чат + медиа + research). */
export function pickDefaultFromCatalog(catalog, prevId) {
  const all = [
    ...(catalog?.models || []),
    ...(catalog?.media_models || catalog?.mediaModels || []),
    ...(catalog?.research_models || catalog?.researchModels || []),
  ];
  if (!all.length) return '';
  const prev = findModelByAnyId(all, prevId);
  if (prev) {
    return resolveModelId(prev, isThinkingEnabled(prev));
  }
  if (catalog?.models?.length) {
    return pickDefaultModel(catalog.models, '');
  }
  const first = all.find((m) => !m.locked) || all[0];
  return resolveModelId(first, isThinkingEnabled(first));
}
