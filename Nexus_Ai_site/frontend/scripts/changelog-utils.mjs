import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const CHANGELOG_PATH = 'src/data/changelog.json';

export const LABEL_META = {
  'Новое': {
    icon: '✨',
    title: 'Новое',
    accent: 'new',
  },
  'Улучшено': {
    icon: '⬆️',
    title: 'Улучшено',
    accent: 'improved',
  },
  'Исправлено': {
    icon: '🛠️',
    title: 'Исправлено',
    accent: 'fixed',
  },
};

export const LABEL_ORDER = ['Новое', 'Улучшено', 'Исправлено'];

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadChangelog(root) {
  const path = join(root, CHANGELOG_PATH);
  const data = readJson(path);
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return { data, entries, path };
}

export function getLatestEntry(entries) {
  const entry = entries?.[0];
  if (!entry) throw new Error(`${CHANGELOG_PATH} has no entries`);
  return entry;
}

export function parseVersion(version) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return match.slice(1).map((part) => Number.parseInt(part, 10));
}

export function compareVersionsDesc(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (av[i] !== bv[i]) return bv[i] - av[i];
  }
  return 0;
}

export function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function sanitizeDiscordMarkdown(value) {
  return normalizeText(value)
    .replace(/@everyone/g, '@\u200beveryone')
    .replace(/@here/g, '@\u200bhere')
    .replace(/https?:\/\/[^\s<>]+/g, (url) => `[открыть](${url})`);
}

export function trimDiscord(value, limit) {
  const text = String(value || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function groupChanges(changes = []) {
  const groups = new Map();
  for (const label of LABEL_ORDER) groups.set(label, []);

  for (const change of changes) {
    const label = normalizeText(change?.label) || 'Изменение';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push({
      label,
      text: normalizeText(change?.text),
    });
  }

  return [...groups.entries()].filter(([, items]) => items.length > 0);
}

export function validateChangelog(root) {
  const errors = [];
  const warnings = [];
  const { entries, path } = loadChangelog(root);
  const packagePath = join(root, 'package.json');
  const packageJson = existsSync(packagePath) ? readJson(packagePath) : null;

  if (!Array.isArray(entries)) {
    errors.push(`${CHANGELOG_PATH}: поле entries должно быть массивом`);
    return { ok: false, errors, warnings, entries, path };
  }

  if (entries.length === 0) {
    errors.push(`${CHANGELOG_PATH}: entries пустой`);
    return { ok: false, errors, warnings, entries, path };
  }

  const seen = new Set();
  let previous = null;

  entries.forEach((entry, index) => {
    const where = `entries[${index}]`;
    const version = normalizeText(entry?.version);
    const title = normalizeText(entry?.title);
    const summary = normalizeText(entry?.summary);
    const date = normalizeText(entry?.date);
    const dateISO = normalizeText(entry?.dateISO);
    const changes = entry?.changes;

    if (!version) errors.push(`${where}: version обязателен`);
    if (version && !parseVersion(version)) {
      errors.push(`${where}: version должен быть semver вида 0.1.30`);
    }
    if (version && seen.has(version)) errors.push(`${where}: версия ${version} дублируется`);
    if (version) seen.add(version);

    if (!date) errors.push(`${where}: date обязателен`);
    if (!dateISO) errors.push(`${where}: dateISO обязателен`);
    if (dateISO && Number.isNaN(Date.parse(`${dateISO}T00:00:00Z`))) {
      errors.push(`${where}: dateISO должен быть валидной датой YYYY-MM-DD`);
    }
    if (!title) errors.push(`${where}: title обязателен`);
    if (!summary) errors.push(`${where}: summary обязателен`);
    if (!Array.isArray(changes) || changes.length === 0) {
      errors.push(`${where}: changes должен быть непустым массивом`);
    } else {
      changes.forEach((change, changeIndex) => {
        const changeWhere = `${where}.changes[${changeIndex}]`;
        const label = normalizeText(change?.label);
        const text = normalizeText(change?.text);
        if (!label) errors.push(`${changeWhere}: label обязателен`);
        if (label && !LABEL_META[label]) {
          warnings.push(
            `${changeWhere}: нестандартный label "${label}" — Discord покажет его как отдельный блок`
          );
        }
        if (!text) errors.push(`${changeWhere}: text обязателен`);
      });
    }

    if (previous) {
      const dateDelta = Date.parse(`${previous.dateISO}T00:00:00Z`) - Date.parse(`${dateISO}T00:00:00Z`);
      const versionDelta = compareVersionsDesc(previous.version, version);
      if (dateDelta < 0) {
        errors.push(`${where}: дата новее предыдущей записи — новые релизы должны быть сверху`);
      }
      if (dateDelta === 0 && versionDelta > 0) {
        errors.push(`${where}: версии за один день должны идти по убыванию`);
      }
    }

    previous = { version, dateISO };
  });

  if (packageJson?.version && entries[0]?.version !== packageJson.version) {
    errors.push(
      `package.json version (${packageJson.version}) не совпадает с latest changelog (${entries[0]?.version})`
    );
  }

  return { ok: errors.length === 0, errors, warnings, entries, path };
}
