import { attachmentsForStorage } from './attachments';
import { imageDisplaySrc } from './imagePersistence';
import { normalizeChatMessage } from './normalizeArrays';

function imagesForCloud(images) {
  if (!images?.length) return undefined;
  return images.map((img) => {
    const entry = {};
    if (img.artifactId) entry.artifactId = img.artifactId;
    const dataUrl = img.dataUrl || (img.url?.startsWith('data:') ? img.url : null);
    if (dataUrl) {
      if (dataUrl.length < 3_500_000) {
        entry.dataUrl = dataUrl;
        entry.url = dataUrl;
      }
    } else if (img.url && img.url.length < 4096) {
      entry.url = img.url;
    }
    return entry;
  }).filter((e) => e.dataUrl || e.url || e.artifactId);
}

/** Урезает вложения и изображения перед отправкой в облако. */
export function sanitizeConversationForCloud(conv) {
  if (!conv?.messages?.length) return conv;
  return {
    ...conv,
    messages: conv.messages.map((m) => {
      let next = m;
      if (m.attachments?.length) {
        next = {
          ...next,
          attachments: attachmentsForStorage(m.attachments, { forCloud: true }),
        };
      }
      if (m.images?.length) {
        const imgs = imagesForCloud(m.images);
        if (imgs?.length) next = { ...next, images: imgs };
      }
      if (m.role === 'assistant' && m.thinking) {
        next = { ...next, thinking: String(m.thinking).slice(0, 120_000) };
      }
      return next;
    }),
  };
}

/** Подставляет preview из артефактов при загрузке чата (если остался только artifactId). */
export function hydrateMessageImages(messages, artifactById) {
  if (!messages?.length || !artifactById?.size) return messages;
  let changed = false;
  const next = messages.map((m) => {
    if (!m.images?.length) return m;
    let msgChanged = false;
    const images = m.images.map((img) => {
      if (imageDisplaySrc(img)) return img;
      const art = img.artifactId ? artifactById.get(img.artifactId) : null;
      if (!art) return img;
      const src = art.preview || art.content?.dataUrl || art.content?.url;
      if (!src) return img;
      msgChanged = true;
      return { ...img, dataUrl: src, url: src };
    });
    if (msgChanged) {
      changed = true;
      return { ...m, images };
    }
    return m;
  });
  return changed ? next : messages;
}

/** Восстановить images[] по sourceMessageId, если облако отдало только текст. */
export function hydrateImagesFromArtifactsByMessage(messages, artifacts) {
  if (!messages?.length || !artifacts?.length) return messages;
  const byMessage = new Map();
  for (const art of artifacts) {
    if (art.kind !== 'image' || !art.sourceMessageId) continue;
    const list = byMessage.get(art.sourceMessageId) || [];
    list.push(art);
    byMessage.set(art.sourceMessageId, list);
  }
  if (!byMessage.size) return messages;

  let changed = false;
  const next = messages.map((m) => {
    if (m.role !== 'assistant' || !m.id) return m;
    const hasDisplayable =
      m.images?.length && m.images.some((img) => imageDisplaySrc(img));
    if (hasDisplayable) return m;

    const arts = byMessage.get(m.id);
    if (!arts?.length) return m;

    const images = arts.map((art) => {
      const src = art.preview || art.content?.dataUrl || art.content?.url || '';
      return {
        artifactId: art.id,
        dataUrl: src.startsWith('data:') ? src : art.content?.dataUrl,
        url: src || art.content?.url,
      };
    }).filter((img) => imageDisplaySrc(img));

    if (!images.length) return m;
    changed = true;
    return { ...m, images };
  });
  return changed ? next : messages;
}

/** null → [] для sources/attachments/images/codeFiles в каждом сообщении */
export function normalizeConversationMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => normalizeChatMessage(m));
}

export function hydrateConversationImages(messages, artifacts) {
  if (!messages?.length) return messages;
  const map = new Map((artifacts || []).map((a) => [a.id, a]));
  let out = normalizeConversationMessages(messages);
  out = hydrateMessageImages(out, map);
  out = hydrateImagesFromArtifactsByMessage(out, artifacts);
  return out;
}
