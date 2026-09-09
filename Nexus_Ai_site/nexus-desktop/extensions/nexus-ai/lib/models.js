const SEGMENT_ORDER = ['cheap', 'medium', 'expensive', 'very_expensive'];
const SEGMENT_LABELS = {
  cheap: 'Дешёвые',
  medium: 'Средние',
  expensive: 'Дорогие',
  very_expensive: 'Премиум',
};

const {
  resolveModelId,
  isThinkingEnabled,
  usesReasoningApiForThinking,
  pickResolvedModelId,
} = require('./thinkingPrefs');

function isImageGenModel(model) {
  if (!model) return false;
  return (
    model.category === 'media' ||
    model.vision_tier === 'image_gen' ||
    model.supports_image_gen === true
  );
}

function filterChatModels(models) {
  return (models || []).filter((m) => !isImageGenModel(m));
}

function groupModelsBySegment(models) {
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

function modelAcceptsPhotos(model) {
  if (!model) return false;
  return Boolean(
    model.accepts_photo_analysis ||
      model.accepts_images ||
      model.supports_vision ||
      model.multimodal ||
      model.vision_tier === 'excellent' ||
      model.vision_tier === 'good' ||
      model.vision_tier === 'limited'
  );
}

function findModelById(models, id) {
  if (!id) return null;
  return (
    (models || []).find(
      (m) => m.id === id || m.model_id_standard === id || m.model_id_thinking === id
    ) || null
  );
}

function pickDefaultModelId(models, prevId, thinkingPrefs = {}) {
  const unlocked = (models || []).filter((m) => !m.locked);
  const pool = unlocked.length ? unlocked : models || [];
  if (!pool.length) return '';
  const prev = findModelById(pool, prevId);
  if (prev && !prev.locked) return pickResolvedModelId(prev, thinkingPrefs);
  const first = pool.find((m) => !m.locked) || pool[0];
  return pickResolvedModelId(first, thinkingPrefs);
}

function formatModelOption(model, thinkingPrefs = {}) {
  const label = model.display_name || model.name || model.id;
  const tier = model.required_tier_label || model.required_tier;
  const lock = model.locked ? ` 🔒 ${tier || ''}` : '';
  const photo = modelAcceptsPhotos(model) ? ' 📷' : '';
  const think = isThinkingEnabled(model, thinkingPrefs) ? ' · мышление' : '';
  return `${label}${think}${photo}${lock}`;
}

function tierAllowsAi(tier) {
  const t = (tier || 'FREE').toUpperCase();
  return t !== 'FREE';
}

module.exports = {
  filterChatModels,
  groupModelsBySegment,
  resolveModelId,
  isThinkingEnabled,
  usesReasoningApiForThinking,
  pickResolvedModelId,
  modelAcceptsPhotos,
  findModelById,
  pickDefaultModelId,
  formatModelOption,
  isImageGenModel,
  tierAllowsAi,
};
