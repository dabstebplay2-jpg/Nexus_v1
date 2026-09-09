/** sync with frontend/src/lib/modelSelection.js (thinking prefs) */
const THINKING_KEY = 'nexus_model_thinking';

function resolveModelId(model, thinkingEnabled) {
  if (!model) return '';
  const standard = model.model_id_standard || model.id;
  const separateThinking =
    model.supports_thinking &&
    model.model_id_thinking &&
    model.model_id_thinking !== model.model_id_standard &&
    !model.thinking_via_reasoning_api;
  return thinkingEnabled && separateThinking ? model.model_id_thinking : standard;
}

function isThinkingEnabled(model, prefs) {
  if (!model?.supports_thinking || !model.family_id) return false;
  const p = prefs || {};
  return Boolean(p[model.family_id]);
}

function usesReasoningApiForThinking(model, prefs) {
  if (!model?.supports_thinking || !isThinkingEnabled(model, prefs)) return false;
  if (model.thinking_via_reasoning_api) return true;
  const std = model.model_id_standard || model.id;
  const th = model.model_id_thinking;
  return Boolean(th && std && th === std);
}

function pickResolvedModelId(model, prefs) {
  if (!model) return '';
  return resolveModelId(model, isThinkingEnabled(model, prefs));
}

module.exports = {
  THINKING_KEY,
  resolveModelId,
  isThinkingEnabled,
  usesReasoningApiForThinking,
  pickResolvedModelId,
};
