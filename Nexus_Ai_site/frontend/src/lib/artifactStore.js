import { uid } from './chatStore';
import { imageDisplaySrc } from './imagePersistence';

const LOCAL_KEY_PREFIX = 'nexus_artifacts_v1_';

let _userKey = 'guest';
const _listeners = new Set();

export function setArtifactUserKey(email) {
  const next = (email || 'guest').toLowerCase();
  if (next === _userKey) return;
  _userKey = next;
  _notify();
}

function storageKey() {
  return `${LOCAL_KEY_PREFIX}${_userKey}`;
}

function _notify() {
  for (const fn of _listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeArtifacts(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function loadLocalArtifacts() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveLocalArtifacts(list) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(list.slice(0, 200)));
  } catch {
    /* quota */
  }
  _notify();
}

export function listArtifacts() {
  return loadLocalArtifacts().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function upsertLocalArtifact(artifact) {
  if (!artifact?.id) return null;
  const list = loadLocalArtifacts();
  const idx = list.findIndex((a) => a.id === artifact.id);
  const entry = {
    id: artifact.id,
    kind: artifact.kind || 'file',
    title: artifact.title || 'Артефакт',
    preview: artifact.preview || imageDisplaySrc(artifact.content) || null,
    content: artifact.content || {},
    sourceChatId: artifact.sourceChatId || null,
    sourceMessageId: artifact.sourceMessageId || null,
    createdAt: artifact.createdAt || Date.now(),
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.unshift(entry);
  saveLocalArtifacts(list);
  return entry;
}

export function removeLocalArtifact(id) {
  const list = loadLocalArtifacts().filter((a) => a.id !== id);
  saveLocalArtifacts(list);
}

export function mergeArtifactLists(remote = [], local = []) {
  const map = new Map();
  for (const a of [...remote, ...local]) {
    if (!a?.id) continue;
    const prev = map.get(a.id);
    map.set(a.id, prev ? { ...prev, ...a } : a);
  }
  return [...map.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function createImageArtifact({ images, chatId, messageId, prompt }) {
  const persisted = images || [];
  const created = [];
  persisted.forEach((img, i) => {
    const src = imageDisplaySrc(img);
    if (!src) return;
    const art = upsertLocalArtifact({
      id: uid(),
      kind: 'image',
      title: (prompt || 'Изображение').slice(0, 80) + (persisted.length > 1 ? ` (${i + 1})` : ''),
      preview: src,
      content: {
        dataUrl: img.dataUrl || (src.startsWith('data:') ? src : undefined),
        url: img.url,
        mime: img.mime,
        prompt: prompt || '',
      },
      sourceChatId: chatId || null,
      sourceMessageId: messageId || null,
      createdAt: Date.now(),
    });
    if (art) {
      created.push({ ...img, artifactId: art.id });
    }
  });
  return created;
}

export function createCodeArtifacts({ codeFiles, chatId, messageId, prompt }) {
  const created = [];
  for (const f of codeFiles || []) {
    const art = upsertLocalArtifact({
      id: uid(),
      kind: 'code',
      title: f.name || f.path || 'Код',
      preview: null,
      content: {
        code: f.content,
        language: f.language,
        fileName: f.name || f.path,
        prompt: prompt || '',
      },
      sourceChatId: chatId || null,
      sourceMessageId: messageId || null,
      createdAt: Date.now(),
    });
    if (art) created.push(art);
  }
  return created;
}
