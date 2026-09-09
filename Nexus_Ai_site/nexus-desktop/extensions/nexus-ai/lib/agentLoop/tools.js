const vscode = require('vscode');
const { exec } = require('child_process');
const { promisify } = require('util');
const {
  readWorkspaceFile,
  applyToWorkspaceFile,
  searchWorkspace,
  workspaceUriFor,
} = require('../agentTools');
const { getEditorContext } = require('../context');

const execAsync = promisify(exec);
const MAX_READ = 48000;

const DANGEROUS_CMD =
  /\b(rm\s+-rf|rm\s+-r\s+-f|del\s+\/|format\s+[a-z]:|mkfs\.|dd\s+if=|curl\s+[^\n]*\|\s*(ba)?sh|wget\s+[^\n]*\|\s*(ba)?sh)/i;

const TOOL_DEFINITIONS = `Доступные инструменты (вызывай через блок \`\`\`nexus-tool json):
{"tool":"list_dir","args":{"path":"."}}
{"tool":"read_file","args":{"path":"relative/path"}}
{"tool":"write_file","args":{"path":"relative/path","content":"..."}}
{"tool":"delete_path","args":{"path":"relative/path"}}
{"tool":"search_workspace","args":{"query":"text"}}
{"tool":"run_terminal","args":{"command":"npm test"}}
{"tool":"get_diagnostics","args":{}}
{"tool":"get_editor_context","args":{}}
Один или несколько JSON-объектов в массиве. После вызова инструментов дождись результатов — не выдумывай вывод.`;

async function confirmDestructive(message) {
  const pick = await vscode.window.showWarningMessage(message, { modal: true }, 'Разрешить', 'Отмена');
  return pick === 'Разрешить';
}

function workspaceRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('Откройте папку workspace (File → Open Folder)');
  return folder;
}

async function toolListDir(args) {
  const uri = workspaceUriFor(args.path || '.');
  const entries = await vscode.workspace.fs.readDirectory(uri);
  const lines = entries
    .filter(([n]) => !n.startsWith('.') && n !== 'node_modules')
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, type]) => {
      const prefix = type === vscode.FileType.Directory ? '📁 ' : '📄 ';
      return prefix + name;
    });
  return lines.join('\n') || '(пусто)';
}

async function toolReadFile(args) {
  const p = args.path;
  if (!p) throw new Error('path обязателен');
  let text = await readWorkspaceFile(String(p));
  if (text.length > MAX_READ) text = `${text.slice(0, MAX_READ)}\n… (обрезано)`;
  return text;
}

async function toolWriteFile(args) {
  const p = args.path;
  const content = args.content;
  if (!p) throw new Error('path обязателен');
  if (content === undefined) throw new Error('content обязателен');
  const rel = String(p).replace(/\\/g, '/');
  const confirmWrites = vscode.workspace.getConfiguration('nexus.ai').get('confirmWrites', true);
  if (confirmWrites) {
    const targetUri = workspaceUriFor(rel, { allowRoot: false });
    let previous = '';
    try {
      previous = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8');
    } catch {
      /* new file */
    }
    const next = String(content);
    if (previous !== next) {
      const preview = await vscode.workspace.openTextDocument({ language: 'plaintext', content: next });
      if (previous) {
        const existingDoc = await vscode.workspace.openTextDocument(targetUri);
        await vscode.commands.executeCommand('vscode.diff', existingDoc.uri, preview.uri, `Preview: ${rel}`);
      } else {
        await vscode.window.showTextDocument(preview, { preview: true });
      }
      const ok = await confirmDestructive(`Записать «${rel}»?`);
      if (!ok) return 'Отменено пользователем';
    }
  }
  await applyToWorkspaceFile(rel, String(content));
  return `Записано: ${p}`;
}

async function toolDeletePath(args) {
  const p = args.path;
  if (!p) throw new Error('path обязателен');
  const ok = await confirmDestructive(`Удалить «${p}» из workspace?`);
  if (!ok) return 'Отменено пользователем';
  const uri = workspaceUriFor(p, { allowRoot: false });
  const edit = new vscode.WorkspaceEdit();
  edit.deleteFile(uri, { recursive: true, ignoreIfNotExists: false });
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) throw new Error('Не удалось удалить');
  return `Удалено: ${p}`;
}

async function toolSearchWorkspace(args) {
  const q = args.query;
  if (!q) throw new Error('query обязателен');
  const hits = await searchWorkspace(String(q), 15);
  if (!hits.length) return 'Ничего не найдено';
  return hits.map((h) => `${h.file}:${h.line} ${h.preview}`).join('\n');
}

async function toolRunTerminal(args) {
  const command = String(args.command || '').trim();
  if (!command) throw new Error('command обязателен');
  const warning = DANGEROUS_CMD.test(command)
    ? `Выполнить потенциально опасную команду?\n${command}`
    : `Разрешить агенту выполнить команду?\n${command}`;
  const ok = await confirmDestructive(warning);
  if (!ok) return 'Отменено пользователем';
  const folder = workspaceRoot();
  const cwd = folder.uri.fsPath;
  const channel = vscode.window.createOutputChannel('Nexus AI Agent');
  channel.appendLine(`$ ${command}`);
  channel.show(true);
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      maxBuffer: 512 * 1024,
      timeout: 120000,
      windowsHide: true,
    });
    const out = [stdout, stderr].filter(Boolean).join('\n').trim();
    return out.slice(0, 16000) || '(команда завершилась без вывода)';
  } catch (e) {
    const msg = e.stdout || e.stderr || e.message || String(e);
    return `Exit ${e.code ?? '?'}: ${String(msg).slice(0, 8000)}`;
  }
}

async function toolGetDiagnostics() {
  const all = vscode.languages.getDiagnostics();
  const lines = [];
  for (const [uri, diags] of all) {
    for (const d of diags) {
      if (d.severity !== vscode.DiagnosticSeverity.Error) continue;
      lines.push(
        `${vscode.workspace.asRelativePath(uri)}:${d.range.start.line + 1} ${d.message.slice(0, 100)}`
      );
    }
    if (lines.length >= 20) break;
  }
  return lines.length ? lines.join('\n') : 'Нет ошибок diagnostics';
}

async function toolGetEditorContext() {
  const ctx = await getEditorContext();
  const parts = [];
  if (ctx.workspaceName) parts.push(`Workspace: ${ctx.workspaceName}`);
  if (ctx.activeFile) parts.push(`File: ${ctx.activeFile}`);
  if (ctx.selection) parts.push(`Selection:\n${ctx.selection.slice(0, 2000)}`);
  return parts.join('\n') || 'Нет открытого редактора';
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} args
 */
async function executeTool(name, args) {
  switch (name) {
    case 'list_dir':
      return toolListDir(args);
    case 'read_file':
      return toolReadFile(args);
    case 'write_file':
      return toolWriteFile(args);
    case 'delete_path':
      return toolDeletePath(args);
    case 'search_workspace':
      return toolSearchWorkspace(args);
    case 'run_terminal':
      return toolRunTerminal(args);
    case 'get_diagnostics':
      return toolGetDiagnostics();
    case 'get_editor_context':
      return toolGetEditorContext();
    default:
      throw new Error(`Неизвестный инструмент: ${name}`);
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
};
