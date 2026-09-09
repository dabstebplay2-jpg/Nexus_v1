const THINKING_KEY = 'nexus_model_thinking';

/** id, который уходит в API */
export function resolveModelId(model, thinkingEnabled) {
  if (!model) return '';
  const standard = model.model_id_standard || model.id;
  const separateThinking =
    model.supports_thinking &&
    model.model_id_thinking &&
    model.model_id_thinking !== model.model_id_standard &&
    !model.thinking_via_reasoning_api;
  return thinkingEnabled && separateThinking ? model.model_id_thinking : standard;
}

export function getModelLabel(model, thinkingEnabled) {
  if (!model) return 'Модель';
  const base = model.display_name || model.name || model.id;
  if (
    thinkingEnabled &&
    model.supports_thinking &&
    (model.thinking_via_reasoning_api ||
      (model.model_id_thinking &&
        model.model_id_thinking !== model.model_id_standard))
  ) {
    return `${base} · мышление`;
  }
  return base;
}

export function loadThinkingPrefs() {
  try {
    return JSON.parse(localStorage.getItem(THINKING_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveThinkingPref(familyId, enabled) {
  const prefs = loadThinkingPrefs();
  if (enabled) prefs[familyId] = true;
  else delete prefs[familyId];
  localStorage.setItem(THINKING_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent('nexus-thinking-changed'));
}

export function isThinkingEnabled(model, prefs) {
  if (!model?.supports_thinking || !model.family_id) return false;
  const p = prefs ?? loadThinkingPrefs();
  return Boolean(p[model.family_id]);
}

/** Мышление на той же модели (reasoning в API), не отдельный Polza id. */
export function usesReasoningApiForThinking(model, prefs) {
  if (!model?.supports_thinking || !isThinkingEnabled(model, prefs)) return false;
  if (model.thinking_via_reasoning_api) return true;
  const std = model.model_id_standard || model.id;
  const th = model.model_id_thinking;
  return Boolean(th && std && th === std);
}

/** Найти семейство по любому id (standard / thinking) */
export function findModelByAnyId(models, id) {
  if (!id) return null;
  return (
    (models || []).find(
      (m) =>
        m.id === id ||
        m.model_id_standard === id ||
        m.model_id_thinking === id
    ) || null
  );
}

export function pickDefaultModel(models, prevId) {
  if (!models?.length) return '';
  const prev = findModelByAnyId(models, prevId);
  if (prev) return resolveModelId(prev, isThinkingEnabled(prev));
  const prefs = loadThinkingPrefs();
  const first = models[0];
  return resolveModelId(first, isThinkingEnabled(first, prefs));
}
