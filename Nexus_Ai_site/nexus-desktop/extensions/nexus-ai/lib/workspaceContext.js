const vscode = require('vscode');
const path = require('path');
const { getEditorContext, formatContextForPrompt } = require('./context');

const IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  '__pycache__',
]);

/**
 * @param {string} dirRel
 * @param {number} depth
 * @param {number} maxDepth
 * @returns {Promise<string[]>}
 */
async function listDirLines(dirRel, depth, maxDepth) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder || depth > maxDepth) return [];
  const base = dirRel
    ? vscode.Uri.joinPath(folder.uri, dirRel.replace(/\\/g, '/'))
    : folder.uri;
  let entries;
  try {
    entries = await vscode.workspace.fs.readDirectory(base);
  } catch {
    return [];
  }
  const lines = [];
  const sorted = entries.sort((a, b) => {
    if (a[1] === b[1]) return a[0].localeCompare(b[0]);
    return a[1] === vscode.FileType.Directory ? -1 : 1;
  });
  for (const [name, type] of sorted) {
    if (IGNORE.has(name) || name.startsWith('.')) continue;
    const rel = dirRel ? `${dirRel}/${name}` : name;
    const indent = '  '.repeat(depth);
    if (type === vscode.FileType.Directory) {
      lines.push(`${indent}${name}/`);
      if (depth < maxDepth) {
        const sub = await listDirLines(rel, depth + 1, maxDepth);
        lines.push(...sub);
      }
    } else {
      lines.push(`${indent}${name}`);
    }
    if (lines.length > 120) break;
  }
  return lines;
}

async function getWorkspaceTreeSummary(maxDepth = 2) {
  const lines = await listDirLines('', 0, maxDepth);
  if (!lines.length) return '';
  return `Project tree (top levels):\n${lines.join('\n')}`;
}

async function getDiagnosticsSummary() {
  const all = vscode.languages.getDiagnostics();
  const items = [];
  for (const [uri, diags] of all) {
    const errors = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    if (!errors.length) continue;
    const rel = vscode.workspace.asRelativePath(uri);
    for (const e of errors.slice(0, 3)) {
      items.push(`${rel}:${e.range.start.line + 1} ${e.message.slice(0, 80)}`);
    }
    if (items.length >= 12) break;
  }
  if (!items.length) return '';
  return `Diagnostics (errors):\n${items.join('\n')}`;
}

function getOpenFilesSummary() {
  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
  const paths = tabs
    .map((t) => {
      const input = t.input;
      if (input && typeof input === 'object' && 'uri' in input) {
        return vscode.workspace.asRelativePath(input.uri);
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 12);
  if (!paths.length) return '';
  return `Open tabs:\n${paths.join('\n')}`;
}

async function buildAgentContextBlock() {
  const ctx = await getEditorContext();
  const parts = [
    formatContextForPrompt(ctx),
    getOpenFilesSummary(),
    await getWorkspaceTreeSummary(2),
    await getDiagnosticsSummary(),
  ].filter(Boolean);
  return parts.join('\n\n');
}

module.exports = {
  buildAgentContextBlock,
  getWorkspaceTreeSummary,
};
