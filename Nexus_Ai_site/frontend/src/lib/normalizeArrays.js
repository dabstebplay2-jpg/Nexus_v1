/** @param {unknown} value @returns {unknown[]} */
export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** @param {unknown} value @returns {unknown[]} */
export function ensureArray(value) {
  return asArray(value);
}

/** Нормализует поля-массивы в сообщении чата (null → []). */
export function normalizeChatMessage(m) {
  if (!m || typeof m !== 'object') return m;
  const needsFix =
    (m.sources != null && !Array.isArray(m.sources)) ||
    (m.attachments != null && !Array.isArray(m.attachments)) ||
    (m.images != null && !Array.isArray(m.images)) ||
    (m.codeFiles != null && !Array.isArray(m.codeFiles)) ||
    m.sources === null ||
    m.attachments === null ||
    m.images === null ||
    m.codeFiles === null;
  if (!needsFix) return m;
  return {
    ...m,
    sources: asArray(m.sources),
    attachments: asArray(m.attachments),
    images: asArray(m.images),
    codeFiles: asArray(m.codeFiles),
  };
}

/** @param {unknown} guide @returns {null | { excellent: unknown[]; good: unknown[]; text_only: unknown[]; image_generation: unknown[] }} */
export function normalizeVisionGuide(guide) {
  if (!guide || typeof guide !== 'object') return null;
  const pick = (key) => asArray(guide[key]);
  return {
    excellent: pick('excellent'),
    good: pick('good'),
    text_only: pick('text_only'),
    image_generation: pick('image_generation'),
  };
}
