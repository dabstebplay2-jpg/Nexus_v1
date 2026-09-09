const vscode = require('vscode');
const path = require('path');

/**
 * @returns {Promise<{ activeFile?: string, languageId?: string, selection?: string, workspaceName?: string }>}
 */
async function getEditorContext() {
  const editor = vscode.window.activeTextEditor;
  const folder = vscode.workspace.workspaceFolders?.[0];
  const ctx = {
    workspaceName: folder?.name,
  };
  if (!editor) return ctx;
  const doc = editor.document;
  const rel = folder
    ? path.relative(folder.uri.fsPath, doc.uri.fsPath).replace(/\\/g, '/')
    : doc.fileName;
  ctx.activeFile = rel;
  ctx.languageId = doc.languageId;
  const sel = editor.selection;
  if (!sel.isEmpty) {
    ctx.selection = doc.getText(sel);
  }
  return ctx;
}

/**
 * @param {import('./context').getEditorContext extends () => Promise<infer R> ? R : never} ctx
 */
function formatContextForPrompt(ctx) {
  const lines = [];
  if (ctx.workspaceName) lines.push(`Workspace: ${ctx.workspaceName}`);
  if (ctx.activeFile) lines.push(`Active file: ${ctx.activeFile} (${ctx.languageId || 'text'})`);
  if (ctx.selection) {
    const preview =
      ctx.selection.length > 4000 ? `${ctx.selection.slice(0, 4000)}\n…` : ctx.selection;
    lines.push(`Selection:\n\`\`\`\n${preview}\n\`\`\``);
  }
  return lines.join('\n');
}

module.exports = { getEditorContext, formatContextForPrompt };
