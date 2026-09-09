const vscode = require('vscode');
const path = require('path');
const { getEditorContext, formatContextForPrompt } = require('./lib/context');
const { parseCodeBlocks, applyToWorkspaceFile, searchWorkspace, readWorkspaceFile } = require('./lib/agentTools');
const { getChatPanelHtml } = require('./lib/chatPanelHtml');
const { getSupportPanelHtml } = require('./lib/supportPanelHtml');
const { handleSupportMessage } = require('./lib/supportBridge');
const {
  filterChatModels,
  groupModelsBySegment,
  pickDefaultModelId,
  formatModelOption,
  modelAcceptsPhotos,
  findModelById,
  tierAllowsAi,
} = require('./lib/models');
const { THINKING_KEY } = require('./lib/thinkingPrefs');
const { brandUrisForWebview } = require('./lib/brandAssets');
const { executeChat } = require('./lib/chat/runChat');

const TEXT_EXT = /\.(txt|md|json|csv|log|xml|yaml|yml|html|css|js|ts|tsx|jsx|py|rb|go|rs|java|kt|sql)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

async function getAuth() {
  const ext = vscode.extensions.getExtension('nexus.nexus-auth');
  if (!ext) throw new Error('Nexus Auth not installed');
  if (!ext.isActive) await ext.activate();
  return ext.exports;
}

class AiChatViewProvider {
  constructor(context) {
    this.context = context;
    this.view = null;
    this.abortController = null;
    this.lastBlocks = [];
    this.chatHistory = [];
    this.displayMessages = [];
    this.catalogModels = [];
    this.agents = [];
    this.lastModelId = '';
    this.lastFamilyId = '';
    this.userTier = '';
    this.aiEnabled = true;
    this.thinkingPrefs = context.globalState.get(THINKING_KEY, {});
    this.lastUserRequest = null;
    this.statusBar = null;
  }

  async saveThinkingPrefs() {
    await this.context.globalState.update(THINKING_KEY, this.thinkingPrefs);
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(__dirname, 'lib', 'chat')),
        vscode.Uri.file(path.join(__dirname, 'media')),
      ],
    };
    webview.html = getChatPanelHtml(webview);
    webview.onDidReceiveMessage((msg) => this.onMessage(msg, webview));
    this.pushBrandAssets(webview);
  }

  pushBrandAssets(webview) {
    const uris = brandUrisForWebview(webview, this.context.extensionPath);
    this.postToWebview({ type: 'brand', uris }, webview);
  }

  activeWebview(fallback) {
    return this.view?.webview || fallback;
  }

  postToWebview(msg, fallbackWebview) {
    const wv = this.activeWebview(fallbackWebview);
    if (!wv) return;
    setImmediate(() => {
      try {
        wv.postMessage(msg);
      } catch {
        /* webview disposed */
      }
    });
  }

  /** @deprecated use postToWebview */
  post(webview, msg) {
    this.postToWebview(msg, webview);
  }

  async pushAuthState(webview) {
    try {
      const auth = await getAuth();
      const session = await auth.getSession();
      this.postToWebview({ type: 'auth', authorized: session.authorized }, webview);
      if (session.authorized) await this.loadModels(webview);
    } catch {
      this.postToWebview({ type: 'auth', authorized: false }, webview);
    }
  }

  async loadAgents() {
    try {
      const auth = await getAuth();
      const res = await auth.cloudFetch('/ai/agents');
      if (!res.ok) return [];
      const data = await res.json();
      return data.agents || [];
    } catch {
      return [];
    }
  }

  async loadModels(webview) {
    const auth = await getAuth();
    const [modelsRes, agents] = await Promise.all([
      auth.cloudFetch('/ai/models'),
      this.loadAgents(),
    ]);
    if (!modelsRes.ok) throw new Error(`Модели: ${modelsRes.status}`);
    const data = await modelsRes.json();
    this.userTier = data.tier || '';
    this.aiEnabled = data.ai_enabled !== false && tierAllowsAi(this.userTier);
    const chatModels = filterChatModels(data.models || []);
    this.catalogModels = chatModels;
    this.agents = agents;
    const groups = groupModelsBySegment(chatModels).map((g) => ({
      label: g.label,
      models: g.models.map((m) => ({
        id: m.model_id_standard || m.id,
        familyId: m.family_id,
        label: formatModelOption(m, this.thinkingPrefs),
        locked: !!m.locked,
        supportsThinking: !!m.supports_thinking,
        thinkingHint: m.thinking_hint || '',
        thinkingViaApi: !!m.thinking_via_reasoning_api,
        raw: m,
      })),
    }));
    const selectedId = pickDefaultModelId(chatModels, this.lastModelId, this.thinkingPrefs);
    this.lastModelId = selectedId;
    const sel = findModelById(chatModels, selectedId);
    this.lastFamilyId = sel?.family_id || '';
    this.postToWebview(
      {
        type: 'models',
        tier: this.userTier,
        aiEnabled: this.aiEnabled,
        groups,
        models: chatModels,
        selectedId,
        familyId: this.lastFamilyId,
        thinkingPrefs: this.thinkingPrefs,
        agents: this.agents.map((a) => ({
          id: a.id,
          name: `${a.emoji ? `${a.emoji} ` : ''}${a.name || a.id}`.trim(),
          description: a.description || '',
          suggestedPrompts: a.suggested_prompts || [],
        })),
      },
      webview
    );
  }

  async pushContext(webview) {
    const ctx = await getEditorContext();
    const text = formatContextForPrompt(ctx) || 'Нет открытого файла';
    this.postToWebview(
      {
        type: 'context',
        text: `Контекст: ${text.replace(/\n/g, ' · ').slice(0, 220)}`,
      },
      webview
    );
    return ctx;
  }

  async pickWorkspaceFiles(webview) {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Прикрепить к чату',
      filters: {
        Изображения: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
        Текст: ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'css', 'html', 'xml', 'yaml', 'yml', 'csv', 'log'],
      },
    });
    if (!uris?.length) return;

    const items = [];
    for (const uri of uris) {
      try {
        items.push(await this.readUriAsAttachment(uri));
      } catch (e) {
        vscode.window.showWarningMessage(e.message);
      }
    }
    if (items.length) this.postToWebview({ type: 'attachmentsAdd', items }, webview);
  }

  async readUriAsAttachment(uri) {
    const name = path.basename(uri.fsPath);
    const buf = await vscode.workspace.fs.readFile(uri);
    if (IMAGE_EXT.test(name)) {
      const mime = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataBase64 = Buffer.from(buf).toString('base64');
      const previewUrl = `data:${mime};base64,${dataBase64}`;
      return {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'image',
        name,
        mime,
        dataBase64,
        previewUrl,
      };
    }
    if (TEXT_EXT.test(name)) {
      const text = Buffer.from(buf).toString('utf8');
      return {
        id: `att-${Date.now()}`,
        kind: 'file',
        name,
        mime: 'text/plain',
        text: text.length > 32000 ? `${text.slice(0, 32000)}\n… (обрезано)` : text,
      };
    }
    throw new Error(`Формат не поддерживается: ${name}`);
  }

  async onMessage(msg, webview) {
    if (msg.type === 'checkAuth') {
      await this.pushAuthState(webview);
      return;
    }
    if (msg.type === 'loginGoogle') {
      try {
        await vscode.commands.executeCommand('nexus.signInGoogle');
      } catch (e) {
        this.postToWebview({ type: 'error', text: e.message }, webview);
      }
      await this.pushAuthState(webview);
      return;
    }
    if (msg.type === 'loginEmail' || msg.type === 'openAccount') {
      await vscode.commands.executeCommand('nexus.account.focus');
      return;
    }

    const auth = await getAuth();
    const session = await auth.getSession();
    if (!session.authorized) {
      if (msg.type === 'loadModels' || msg.type === 'refreshContext') {
        await this.pushAuthState(webview);
        if (msg.type === 'refreshContext') await this.pushContext(webview);
        return;
      }
      await this.pushAuthState(webview);
      this.postToWebview({ type: 'error', text: 'Сначала войдите в Nexus' }, webview);
      return;
    }

    if (msg.type === 'refreshContext') {
      await this.pushContext(webview);
      return;
    }

    if (msg.type === 'pickWorkspaceFiles') {
      await this.pickWorkspaceFiles(webview);
      return;
    }

    if (msg.type === 'addSelection') {
      const ctx = await getEditorContext();
      if (!ctx.selection) {
        vscode.window.showWarningMessage('Выделите фрагмент в редакторе');
        return;
      }
      this.postToWebview(
        {
          type: 'extra',
          text: `Selection from ${ctx.activeFile}:\n\`\`\`\n${ctx.selection}\n\`\`\``,
        },
        webview
      );
      return;
    }

    if (msg.type === 'applyLast') {
      await this.applyLastBlocks();
      return;
    }

    if (msg.type === 'abort') {
      this.abortController?.abort();
      return;
    }

    if (msg.type === 'loadModels') {
      try {
        await this.loadModels(webview);
      } catch (e) {
        this.postToWebview({ type: 'error', text: e.message }, webview);
      }
      return;
    }

    if (msg.type === 'clearChat') {
      this.chatHistory = [];
      this.displayMessages = [];
      this.lastBlocks = [];
      this.lastUserRequest = null;
      this.postToWebview({ type: 'chatCleared' }, webview);
      return;
    }

    if (msg.type === 'copyText') {
      const text = msg.text || '';
      if (text) {
        await vscode.env.clipboard.writeText(text);
        this.postToWebview({ type: 'copyDone' }, webview);
      }
      return;
    }

    if (msg.type === 'applyBlock') {
      const block = {
        filename: msg.filename || '',
        content: msg.content || '',
        language: msg.language || 'plaintext',
      };
      if (!block.content) return;
      if (!block.filename) {
        const pick = await vscode.window.showInputBox({
          prompt: 'Путь к файлу относительно workspace',
          value: 'file.txt',
        });
        if (!pick) return;
        block.filename = pick;
      }
      try {
        await applyToWorkspaceFile(block.filename, block.content);
        vscode.window.showInformationMessage(`Применено: ${block.filename}`);
        this.postToWebview({ type: 'applied' }, webview);
      } catch (e) {
        vscode.window.showErrorMessage(e.message);
      }
      return;
    }

    if (msg.type === 'regenerate') {
      if (!this.lastUserRequest) {
        this.postToWebview({ type: 'error', text: 'Нет сообщения для повтора' }, webview);
        return;
      }
      if (this.chatHistory.length >= 1) this.chatHistory.pop();
      if (this.displayMessages.length >= 1) this.displayMessages.pop();
      this.postToWebview({ type: 'removeLastTurn' }, webview);
      this.startChat(this.lastUserRequest, webview, auth);
      return;
    }

    if (msg.type === 'saveThinkingPref') {
      const { familyId, enabled } = msg;
      if (familyId) {
        if (enabled) this.thinkingPrefs[familyId] = true;
        else delete this.thinkingPrefs[familyId];
        await this.saveThinkingPrefs();
        try {
          await this.loadModels(webview);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (msg.type === 'chat') {
      this.lastModelId = msg.model;
      this.lastFamilyId = msg.familyId || this.lastFamilyId;
      this.lastUserRequest = {
        text: msg.text,
        extra: msg.extra,
        model: msg.model,
        familyId: msg.familyId,
        attachments: msg.attachments,
        useWebSearch: msg.useWebSearch,
        webSearchDepth: msg.webSearchDepth,
        thinkingEnabled: msg.thinkingEnabled,
        agentId: msg.agentId,
        agentMode: Boolean(msg.agentMode),
      };
      this.startChat(this.lastUserRequest, webview, auth);
      return;
    }

    if (msg.type === 'openSupport') {
      await openSupportPanel();
    }
  }

  startChat(req, webview, auth) {
    const wv = this.activeWebview(webview);
    void executeChat(this, wv, auth, req).catch((e) => {
      this.postToWebview({ type: 'error', text: e?.message || String(e) }, wv);
      this.postToWebview({ type: 'streamEnd', hasBlocks: false, sources: [] }, wv);
    });
  }

  async applyLastBlocks() {
    if (!this.lastBlocks.length) {
      vscode.window.showWarningMessage('Нет блока кода для применения');
      return;
    }
    const block = this.lastBlocks.find((b) => b.filename) || this.lastBlocks[0];
    if (!block.filename) {
      const pick = await vscode.window.showInputBox({
        prompt: 'Путь к файлу относительно workspace',
        value: vscode.window.activeTextEditor?.document.uri
          ? path.basename(vscode.window.activeTextEditor.document.uri.fsPath)
          : 'file.txt',
      });
      if (!pick) return;
      block.filename = pick;
    }
    try {
      await applyToWorkspaceFile(block.filename, block.content);
      vscode.window.showInformationMessage(`Применено: ${block.filename}`);
      this.postToWebview({ type: 'applied' });
    } catch (e) {
      vscode.window.showErrorMessage(e.message);
    }
  }
}

let provider;
let supportPanel = null;

async function openSupportPanel() {
  try {
    const auth = await getAuth();
    const session = await auth.getSession();
    if (!session.authorized) {
      const pick = await vscode.window.showWarningMessage(
        'Войдите в Nexus, чтобы написать в поддержку',
        'Войти'
      );
      if (pick === 'Войти') await vscode.commands.executeCommand('nexus.account.focus');
      return;
    }
    if (supportPanel) {
      supportPanel.reveal();
      return;
    }
    supportPanel = vscode.window.createWebviewPanel(
      'nexusSupport',
      'Поддержка Nexus',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    supportPanel.webview.html = getSupportPanelHtml();
    supportPanel.onDidDispose(() => {
      supportPanel = null;
    });
    supportPanel.webview.onDidReceiveMessage(async (msg) => {
      await handleSupportMessage(msg, supportPanel.webview, auth);
    });
  } catch (e) {
    vscode.window.showErrorMessage(e.message || String(e));
  }
}

async function addSelectionToChat() {
  if (!provider?.view?.webview) {
    await vscode.commands.executeCommand('nexus.aiChat.focus');
  }
  const webview = provider?.view?.webview;
  if (webview) await provider.onMessage({ type: 'addSelection' }, webview);
}

async function searchAndInsert() {
  const q = await vscode.window.showInputBox({ prompt: 'Поиск по workspace' });
  if (!q) return;
  const hits = await searchWorkspace(q, 15);
  if (!hits.length) {
    vscode.window.showInformationMessage('Ничего не найдено');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    hits.map((h) => `${h.file}:${h.line} — ${h.preview}`),
    { placeHolder: 'Результаты поиска' }
  );
  if (!pick) return;
  const file = pick.split(':')[0];
  try {
    const text = await readWorkspaceFile(file);
    const preview = text.length > 3000 ? `${text.slice(0, 3000)}\n…` : text;
    provider?.postToWebview({
      type: 'extra',
      text: `File ${file}:\n\`\`\`\n${preview}\n\`\`\``,
    });
    await vscode.commands.executeCommand('nexus.aiChat.focus');
  } catch (e) {
    vscode.window.showErrorMessage(e.message);
  }
}

function subscribeAuthChanges(context) {
  const hook = () => {
    const ext = vscode.extensions.getExtension('nexus.nexus-auth');
    if (!ext?.isActive || !ext.exports?.onAuthChanged) return false;
    context.subscriptions.push(
      ext.exports.onAuthChanged(() => {
        const wv = provider?.view?.webview;
        if (wv) provider.pushAuthState(wv);
      })
    );
    return true;
  };
  if (!hook()) {
    const sub = vscode.extensions.onDidChange(() => {
      if (hook()) sub.dispose();
    });
    context.subscriptions.push(sub);
  }
}

function activate(context) {
  provider = new AiChatViewProvider(context);
  const version = context.extension.packageJSON?.version || '?';
  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  sb.text = `$(hubot) Nexus AI ${version}`;
  sb.tooltip = `Nexus AI ${version}\n${context.extensionPath}`;
  sb.command = 'nexus.ai.showBuildInfo';
  sb.show();
  provider.statusBar = sb;
  context.subscriptions.push(sb);

  subscribeAuthChanges(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('nexus.aiChat', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('nexus.openAiChat', () => {
      vscode.commands.executeCommand('nexus.aiChat.focus');
    }),
    vscode.commands.registerCommand('nexus.ai.addSelection', addSelectionToChat),
    vscode.commands.registerCommand('nexus.ai.applyLastBlock', () => provider?.applyLastBlocks()),
    vscode.commands.registerCommand('nexus.ai.searchWorkspace', searchAndInsert),
    vscode.commands.registerCommand('nexus.ai.attachFile', async () => {
      await vscode.commands.executeCommand('nexus.aiChat.focus');
      const wv = provider?.view?.webview;
      if (wv) await provider.pickWorkspaceFiles(wv);
    }),
    vscode.commands.registerCommand('nexus.openSupport', () => openSupportPanel()),
    vscode.commands.registerCommand('nexus.ai.showBuildInfo', () => {
      const ext = vscode.extensions.getExtension('nexus.nexus-ai');
      const info = ext
        ? `path=${ext.extensionPath}\nversion=${ext.packageJSON?.version}`
        : 'nexus.nexus-ai not found';
      vscode.window.showInformationMessage(`Nexus AI\n${info}`, { modal: true });
    }),
    vscode.commands.registerCommand('nexus.ai.clearChat', async () => {
      if (!provider?.view?.webview) {
        await vscode.commands.executeCommand('nexus.aiChat.focus');
      }
      const wv = provider?.view?.webview;
      if (wv) await provider.onMessage({ type: 'clearChat' }, wv);
    })
  );

  const agentHintKey = 'nexus.ai.agentHintShown';
  if (!context.globalState.get(agentHintKey)) {
    context.globalState.update(agentHintKey, true);
    setTimeout(() => {
      vscode.window
        .showInformationMessage(
          'Режим ⚡ Агент: доступ к файлам и терминалу workspace. Переключите в панели AI Chat.',
          'Открыть чат'
        )
        .then((p) => {
          if (p === 'Открыть чат') vscode.commands.executeCommand('nexus.aiChat.focus');
        });
    }, 3000);
  }
}

function deactivate() {}

module.exports = { activate, deactivate, AiChatViewProvider };
