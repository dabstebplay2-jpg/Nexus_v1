/**
 * Virtual filesystem for Web IDE on Vercel (no local backend).
 * Persists in IndexedDB.
 */

const DB_NAME = 'nexus-demo-workspace-v1';
const STORE = 'files';

const DEMO_ROOT = 'demo://nexus-project';

const SEED_FILES = {
  'README.md': `# Nexus Demo Project

Добро пожаловать в **IDE Web** — демо-проект в браузере.

- Откройте \`src/app.js\` и отредактируйте код
- Спросите **Agent** (боковая панель) про архитектуру
- Для реального репозитория скачайте [Nexus IDE Desktop](/ide)
`,
  'package.json': JSON.stringify(
    {
      name: 'nexus-demo',
      version: '0.1.0',
      private: true,
      scripts: { start: 'node src/app.js' },
    },
    null,
    2
  ),
  'src/app.js': `// Nexus demo — отредактируйте и спросите Agent

export function greet(name = 'Nexus') {
  return \`Hello, \${name}!\`;
}

console.log(greet());
`,
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAllSimple() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const result = {};
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        result[cursor.key] = cursor.value;
        cursor.continue();
      } else {
        resolve(result);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

async function idbPut(path, content) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(content, path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(path) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

function buildTreeFromPaths(paths, rootName = 'nexus-demo') {
  const root = { name: rootName, path: DEMO_ROOT, is_dir: true, children: [] };

  const ensureDir = (parts, parent) => {
    if (!parts.length) return parent;
    const [head, ...rest] = parts;
    let child = parent.children.find((c) => c.is_dir && c.name === head);
    if (!child) {
      const dirPath = parent.path === DEMO_ROOT ? `${DEMO_ROOT}/${head}` : `${parent.path}/${head}`;
      child = { name: head, path: dirPath, is_dir: true, children: [] };
      parent.children.push(child);
    }
    return ensureDir(rest, child);
  };

  for (const rel of paths) {
    const parts = normalizePath(rel).split('/').filter(Boolean);
    if (!parts.length) continue;
    const fileName = parts.pop();
    const dir = parts.length ? ensureDir(parts, root) : root;
    dir.children.push({
      name: fileName,
      path: `${dir.path}/${fileName}`,
      is_dir: false,
    });
  }

  const sortNode = (node) => {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortNode);
    }
  };
  sortNode(root);
  return root;
}

export function getDemoRootPath() {
  return DEMO_ROOT;
}

export async function initDemoWorkspace() {
  const existing = await idbGetAllSimple();
  if (Object.keys(existing).length === 0) {
    for (const [path, content] of Object.entries(SEED_FILES)) {
      await idbPut(path, content);
    }
  }
}

export async function getDemoTree() {
  const files = await idbGetAllSimple();
  return buildTreeFromPaths(Object.keys(files));
}

export async function demoReadFile(path) {
  const rel = path.startsWith(DEMO_ROOT) ? path.slice(DEMO_ROOT.length + 1) : normalizePath(path);
  const files = await idbGetAllSimple();
  const content = files[normalizePath(rel)];
  if (content == null) throw new Error('File not found');
  return { status: 'success', content };
}

export async function demoWriteFile(path, content) {
  const rel = path.startsWith(DEMO_ROOT) ? path.slice(DEMO_ROOT.length + 1) : normalizePath(path);
  await idbPut(normalizePath(rel), content);
  return { status: 'success' };
}

export async function demoPatchFile(path, searchBlock, replaceBlock) {
  const { content } = await demoReadFile(path);
  const contentNorm = content.replace(/\r\n/g, '\n');
  const searchNorm = String(searchBlock || '').replace(/\r\n/g, '\n');
  const replaceNorm = String(replaceBlock || '').replace(/\r\n/g, '\n');
  if (!searchNorm || !contentNorm.includes(searchNorm)) {
    return `Error: Could not find the exact search_block in '${path}'. Copy the existing block precisely.`;
  }
  await demoWriteFile(path, contentNorm.replace(searchNorm, replaceNorm));
  return `Success: patched file.`;
}

export async function demoListDirectory(reqPath = '.') {
  const files = await idbGetAllSimple();
  const norm = normalizePath(reqPath === '.' ? '' : reqPath);
  const prefix = norm ? `${norm}/` : '';
  const dirs = new Set();
  const entries = new Set();
  for (const rel of Object.keys(files)) {
    if (norm && !rel.startsWith(prefix) && rel !== norm) continue;
    const rest = norm ? rel.slice(prefix.length) : rel;
    const parts = rest.split('/').filter(Boolean);
    if (!parts.length) continue;
    if (parts.length === 1) entries.add(parts[0]);
    else dirs.add(parts[0]);
  }
  const lines = [
    ...[...dirs].sort().map((d) => `📁 ${d}`),
    ...[...entries].sort().map((f) => `📄 ${f}`),
  ];
  return lines.length ? lines.join('\n') : '(empty)';
}

export async function buildDemoContextForAI(fileTree, formatTreeFn) {
  const files = await idbGetAllSimple();
  let ctx = fileTree && formatTreeFn ? formatTreeFn(fileTree) : '';
  ctx += '\n\n--- File contents (demo) ---\n';
  for (const [rel, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    ctx += `\n### ${rel}\n\`\`\`\n${content}\n\`\`\`\n`;
  }
  return ctx;
}

export async function demoCreateFile(parentPath, name) {
  const base = parentPath.startsWith(DEMO_ROOT) ? parentPath : DEMO_ROOT;
  const full = `${base}/${name}`.replace(/\/+/g, '/');
  await idbPut(full.slice(DEMO_ROOT.length + 1), '');
  return { status: 'success', path: full };
}

export async function demoCreateFolder(parentPath, name) {
  return { status: 'success', path: `${parentPath}/${name}` };
}

export async function demoDelete(path) {
  const rel = path.startsWith(DEMO_ROOT) ? path.slice(DEMO_ROOT.length + 1) : normalizePath(path);
  await idbDelete(normalizePath(rel));
  return { status: 'success' };
}

export async function demoSearch(query) {
  const files = await idbGetAllSimple();
  const q = query.toLowerCase();
  const results = [];
  for (const [rel, content] of Object.entries(files)) {
    if (rel.toLowerCase().includes(q) || String(content).toLowerCase().includes(q)) {
      results.push({ path: `${DEMO_ROOT}/${rel}`, line: 1, preview: rel });
    }
  }
  return results;
}

const DEMO_TERMINAL_RESPONSES = {
  ls: 'README.md  package.json  src/\n',
  'ls src': 'app.js\n',
  'cat README.md': `${SEED_FILES['README.md'].split('\n').slice(0, 4).join('\n')}\n`,
  'npm test': '✓ demo tests passed (mock)\n',
  help: 'Демо-терминал: ls, cat <file>, npm test, help\n',
};

export function runDemoTerminalCommand(cmd) {
  const trimmed = cmd.trim();
  if (!trimmed) return '\n';
  if (DEMO_TERMINAL_RESPONSES[trimmed]) return DEMO_TERMINAL_RESPONSES[trimmed];
  if (trimmed.startsWith('cat ')) {
    const file = trimmed.slice(4).trim();
    const key = file.replace(/^src\//, 'src/');
    if (SEED_FILES[key] || SEED_FILES[file]) {
      return `${SEED_FILES[key] || SEED_FILES[file]}\n`;
    }
  }
  return `demo: command not found: ${trimmed}\n(try: ls, cat README.md, npm test)\n`;
}
