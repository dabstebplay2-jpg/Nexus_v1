const vscode = require('vscode');
const path = require('path');

/**
 * @param {import('vscode').Webview} webview
 */
function getChatPanelHtml(webview) {
  const chatDir = path.join(__dirname, 'chat');
  const cspSource = webview.cspSource;
  const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(chatDir, 'panel.css')));
  const mdUri = webview.asWebviewUri(vscode.Uri.file(path.join(chatDir, 'markdown.js')));
  const jsUri = webview.asWebviewUri(vscode.Uri.file(path.join(chatDir, 'panel.js')));

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource}; img-src data: blob: https: ${cspSource};" />
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <header class="top-bar">
    <div class="brand">
      <div class="brand-icon" aria-hidden="true"></div>
      <div class="brand-titles">
        <img class="brand-lockup" id="brandLockup" alt="Nexus AI" />
        <h1 class="brand-fallback-title">Nexus AI</h1>
        <span class="tier-pill" id="tierPill">—</span>
        <span class="mode-pill" id="modePill">Чат</span>
      </div>
    </div>
    <div class="header-actions">
      <button type="button" class="chip-btn" id="btnAgentMode" title="Режим агента с инструментами IDE">💬 Чат</button>
      <button type="button" class="chip-btn icon-only" id="btnClear" title="Очистить чат">🗑</button>
      <button type="button" class="chip-btn icon-only" id="btnAccount" title="Аккаунт и тариф">👤</button>
      <button type="button" class="chip-btn icon-only" id="btnSupport" title="Поддержка">🛟</button>
    </div>
  </header>

  <div id="loginGate">
    <h3>Войдите в Nexus</h3>
    <p>Тот же аккаунт, что на сайте — Google или код из письма.</p>
    <button type="button" class="lg-btn lg-primary" id="lgGoogle">Войти через Google</button>
    <button type="button" class="lg-btn lg-secondary" id="lgEmail">Код на email</button>
    <button type="button" class="lg-btn lg-secondary" id="lgAccount">Панель аккаунта</button>
  </div>

  <div id="chatMain" class="locked">
    <div class="messages-wrap" id="messagesWrap">
      <div id="emptyState" class="empty-state">
        <img class="empty-brand" id="emptyBrand" alt="Nexus" />
        <h2>Чем помочь?</h2>
        <p>Спросите про код, включите 🌐 для поиска в сети или прикрепите файл. <kbd>Ctrl+Enter</kbd> — отправить.</p>
      </div>
      <div id="streamStatus" class="stream-status" aria-live="polite"></div>
      <div id="messages" role="log" aria-live="polite"></div>
      <button type="button" class="scroll-fab" id="scrollFab" title="Вниз">↓</button>
    </div>

    <div class="composer">
      <div class="ctx-line" id="ctx" title="">Контекст: —</div>
      <div class="composer-toolbar">
        <select id="model" title="Модель"></select>
        <button type="button" class="chip-btn icon-only" id="refreshModels" title="Обновить модели">↻</button>
      </div>
      <div class="composer-toolbar">
        <select id="agent" title="Агент"><option value="">Без агента</option></select>
        <button type="button" class="chip-btn icon-only globe-btn" id="btnGlobe" title="Автопоиск в сети — только когда нужны свежие факты">🌐</button>
        <select id="searchDepth" title="Глубина поиска" disabled>
          <option value="quick">Быстрый</option>
          <option value="standard" selected>Обычный</option>
          <option value="deep">Глубокий</option>
        </select>
      </div>
      <button type="button" class="chip-btn think-chip" id="btnThinking" style="display:none" title="Режим мышления">
        🧠 Режим мышления
      </button>
      <p class="hint" id="modelHint">—</p>
      <div id="agentPrompts" class="agent-prompts"></div>
      <div id="attachStrip"></div>
      <div id="applyBar"><button type="button" id="btnApply">⚡ Применить последний блок кода</button></div>
      <div class="input-wrap">
        <textarea id="input" rows="2" placeholder="Сообщение… Enter или Ctrl+Enter — отправить"></textarea>
        <div class="input-tools">
          <button type="button" class="chip-btn icon-only" id="btnAttach" title="Фото или файл">📎</button>
          <button type="button" class="chip-btn icon-only" id="btnWorkspace" title="Из проекта">📁</button>
          <button type="button" class="chip-btn icon-only" id="btnSel" title="Выделение">✂</button>
          <button type="button" class="chip-btn icon-only" id="btnCtx" title="Контекст редактора">📍</button>
        </div>
      </div>
      <input type="file" id="fileInput" multiple accept="image/jpeg,image/png,image/webp,image/gif,.txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.css,.html,.xml,.yaml,.yml,.csv,.log" />
      <div class="send-row">
        <button type="button" id="send">Отправить</button>
        <button type="button" id="stop" disabled>Стоп</button>
      </div>
    </div>
  </div>

  <div id="toast" class="toast" role="status"></div>

  <script src="${mdUri}"></script>
  <script src="${jsUri}"></script>
</body>
</html>`;
}

module.exports = { getChatPanelHtml };
