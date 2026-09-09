const vscode = require('vscode');
const path = require('path');
const { normalizeWorkspaceRelativePath } = require('./workspacePath');

function workspaceUriFor(relativePath, options) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('Откройте папку workspace (File → Open Folder)');
  }
  const normalized = normalizeWorkspaceRelativePath(relativePath, options);
  return normalized === '.' ? folder.uri : vscode.Uri.joinPath(folder.uri, normalized);
}

/** @returns {{ filename: string, language: string, content: string }[]} */
function parseCodeBlocks(text) {
  const blocks = [];
  const re = /```(\w*)[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const lang = m[1] || 'plaintext';
    const body = m[2] || '';
    const firstLine = body.split('\n')[0]?.trim() || '';
    let filename = '';
    let content = body;
    if (/^[\w./\\-]+\.\w+$/.test(firstLine) && body.includes('\n')) {
      filename = firstLine;
      content = body.slice(body.indexOf('\n') + 1);
    }
    blocks.push({ language: lang, filename, content: content.trimEnd() });
  }
  return blocks;
}

/**
 * @param {string} relativePath
 * @param {string} content
 */
async function applyToWorkspaceFile(relativePath, content) {
  const target = workspaceUriFor(relativePath, { allowRoot: false });
  const edit = new vscode.WorkspaceEdit();
  try {
    const doc = await vscode.workspace.openTextDocument(target);
    const full = new vscode.Range(0, 0, doc.lineCount, 0);
    edit.replace(target, full, content.endsWith('\n') ? content : `${content}\n`);
  } catch {
    edit.createFile(target, { overwrite: true });
    edit.insert(target, new vscode.Position(0, 0), content.endsWith('\n') ? content : `${content}\n`);
  }
  const ok = await vscode.workspace.applyEdit(edit);
  if (!ok) throw new Error('Не удалось применить правку');
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc, { preview: false });
}

/**
 * @param {string} query
 * @param {number} maxResults
 */
async function searchWorkspace(query, maxResults = 20) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return [];
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, '**/*'),
    '**/{node_modules,.git,dist,build,out}/**',
    maxResults
  );
  const hits = [];
  const q = query.toLowerCase();
  for (const uri of files) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText();
      const idx = text.toLowerCase().indexOf(q);
      if (idx >= 0) {
        const rel = path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, '/');
        const line = text.slice(0, idx).split('\n').length;
        hits.push({ file: rel, line, preview: text.split('\n')[line - 1]?.trim().slice(0, 120) });
      }
    } catch {
      /* skip binary */
    }
    if (hits.length >= maxResults) break;
  }
  return hits;
}

async function readWorkspaceFile(relativePath) {
  const uri = workspaceUriFor(relativePath, { allowRoot: false });
  const doc = await vscode.workspace.openTextDocument(uri);
  return doc.getText();
}

module.exports = {
  parseCodeBlocks,
  applyToWorkspaceFile,
  searchWorkspace,
  readWorkspaceFile,
  workspaceUriFor,
};
