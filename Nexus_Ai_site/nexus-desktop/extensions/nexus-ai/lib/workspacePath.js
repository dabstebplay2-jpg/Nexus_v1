const path = require('path');

function normalizeWorkspaceRelativePath(value, { allowRoot = true } = {}) {
  const raw = String(value ?? '').trim().replace(/\\/g, '/');
  if (!raw || raw.includes('\0')) throw new Error('Некорректный путь');
  if (raw.startsWith('/') || raw.startsWith('//') || /^[a-zA-Z]:/.test(raw)) {
    throw new Error('Разрешены только относительные пути внутри workspace');
  }

  const segments = raw.split('/').filter((segment) => segment && segment !== '.');
  if (segments.includes('..')) {
    throw new Error('Путь не должен выходить за пределы workspace');
  }
  const normalized = segments.join('/');
  if (!normalized) {
    if (allowRoot) return '.';
    throw new Error('Укажите путь внутри workspace');
  }
  if (path.isAbsolute(normalized)) {
    throw new Error('Разрешены только относительные пути внутри workspace');
  }
  return normalized;
}

module.exports = { normalizeWorkspaceRelativePath };
