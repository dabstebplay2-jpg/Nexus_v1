const LANG_EXT = {
  html: 'html',
  htm: 'html',
  css: 'css',
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  python: 'py',
  py: 'py',
  json: 'json',
  sql: 'sql',
  bash: 'sh',
  shell: 'sh',
  sh: 'sh',
  rust: 'rs',
  go: 'go',
  java: 'java',
  kotlin: 'kt',
  cpp: 'cpp',
  c: 'c',
  ruby: 'rb',
  php: 'php',
  swift: 'swift',
  yaml: 'yml',
  yml: 'yml',
  xml: 'xml',
  markdown: 'md',
  md: 'md',
  lua: 'lua',
  dart: 'dart',
  vue: 'vue',
  svelte: 'svelte',
  plaintext: 'txt',
  text: 'txt',
};

const EXT_LANG = Object.fromEntries(
  Object.entries(LANG_EXT).map(([lang, ext]) => [ext, lang])
);

const DEFAULT_FILENAMES = {
  html: 'index.html',
  css: 'styles.css',
  javascript: 'script.js',
  js: 'script.js',
  typescript: 'index.ts',
  ts: 'index.ts',
  tsx: 'App.tsx',
  jsx: 'App.jsx',
  python: 'main.py',
  py: 'main.py',
  json: 'data.json',
  sql: 'query.sql',
  bash: 'script.sh',
  shell: 'script.sh',
  rust: 'main.rs',
  go: 'main.go',
  java: 'Main.java',
  kotlin: 'Main.kt',
  ruby: 'main.rb',
  php: 'index.php',
  swift: 'main.swift',
  yaml: 'config.yml',
  xml: 'data.xml',
  markdown: 'README.md',
  md: 'README.md',
  vue: 'App.vue',
  svelte: 'App.svelte',
  dart: 'main.dart',
  lua: 'main.lua',
  text: 'file.txt',
  plaintext: 'file.txt',
};

export function normalizeLang(raw) {
  const k = (raw || '').toLowerCase().trim();
  if (!k) return 'text';
  if (LANG_EXT[k]) return k === 'js' ? 'javascript' : k === 'py' ? 'python' : k === 'md' ? 'markdown' : k;
  return k;
}

export function languageLabel(language) {
  const map = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    bash: 'Bash',
    shell: 'Shell',
    markdown: 'Markdown',
    plaintext: 'Текст',
    text: 'Текст',
  };
  const lang = normalizeLang(language);
  return map[lang] || lang.charAt(0).toUpperCase() + lang.slice(1);
}

export function monacoLanguage(language, filename) {
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext && EXT_LANG[ext]) return EXT_LANG[ext] === 'js' ? 'javascript' : EXT_LANG[ext];
  }
  const lang = normalizeLang(language);
  if (lang === 'js') return 'javascript';
  if (lang === 'py') return 'python';
  if (lang === 'md') return 'markdown';
  if (lang === 'sh') return 'shell';
  return lang;
}

function extFromFilename(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

function parseFenceHeader(header) {
  const tokens = (header || '').trim().split(/[\s:]+/).filter(Boolean);
  let language = 'text';
  let filename = null;

  for (const token of tokens) {
    if (/\.[a-z0-9]+$/i.test(token)) {
      filename = token;
      const ext = extFromFilename(token);
      if (EXT_LANG[ext]) language = EXT_LANG[ext];
    } else {
      const norm = normalizeLang(token);
      if (LANG_EXT[norm] || DEFAULT_FILENAMES[norm]) language = norm;
    }
  }

  return { language, filename };
}

function defaultFilename(language, usedNames) {
  const base = DEFAULT_FILENAMES[language] || `file.${LANG_EXT[language] || 'txt'}`;
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let n = 2;
  while (usedNames.has(`${stem}-${n}${ext}`)) n += 1;
  const name = `${stem}-${n}${ext}`;
  usedNames.add(name);
  return name;
}

/** Убирает дублирующий список ссылок в конце ответа (UI показывает источники отдельно). */
export function stripTrailingSourcesSection(text = '') {
  if (!text?.trim()) return text || '';
  const lines = text.split('\n');
  const startRe =
    /^(#{1,3}\s*)?(источники|sources|ссылки|references|библиография)\s*:?\s*$/i;
  let cut = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (startRe.test(lines[i].trim())) {
      cut = i;
      break;
    }
  }
  if (cut < 0) return text;
  const tail = lines.slice(cut);
  const linkish = tail.filter((l) => /https?:\/\//i.test(l) || /^\s*[\[\(]?\d+[\]\).]?\s/.test(l));
  if (linkish.length >= 2 || tail.length >= 4) {
    return lines.slice(0, cut).join('\n').trimEnd();
  }
  return text;
}

/**
 * @param {string} text
 * @returns {{ prose: string, codeFiles: Array<{ id: string, language: string, languageLabel: string, filename: string, content: string, complete: boolean }>, hasCode: boolean }}
 */
export function parseMessageContent(text = '') {
  if (!text) {
    return { prose: '', codeFiles: [], hasCode: false };
  }

  const parts = text.split('```');
  const codeFiles = [];
  const usedNames = new Set();
  let prose = '';

  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 0) {
      prose += parts[i];
      continue;
    }

    const chunk = parts[i];
    const nl = chunk.indexOf('\n');
    const header = nl >= 0 ? chunk.slice(0, nl).trim() : chunk.trim();
    const body = nl >= 0 ? chunk.slice(nl + 1) : '';
    const { language, filename: headerName } = parseFenceHeader(header);
    const lang = normalizeLang(language);
    const filename = headerName || defaultFilename(lang, usedNames);
    const complete = i < parts.length - 1;

    codeFiles.push({
      id: `f${codeFiles.length}`,
      language: lang,
      languageLabel: languageLabel(lang),
      filename,
      content: body.replace(/\n$/, ''),
      complete,
    });
  }

  return {
    prose: stripTrailingSourcesSection(prose.trimEnd()),
    codeFiles,
    hasCode: codeFiles.length > 0,
  };
}
