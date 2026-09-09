const vscode = require('vscode');
const path = require('path');
const { randomBytes } = require('crypto');
const auth = require('./authCore');
const { brandUrisForWebview } = require('./brandAssets');

function getAccountHtml(webview) {
  const nonce = randomBytes(18).toString('base64');
  const cspSource = webview.cspSource;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource};" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      margin: 0;
      padding: 12px;
      line-height: 1.45;
    }
    .account-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
    }
    .account-header img { max-width: 200px; max-height: 32px; object-fit: contain; }
    .account-header .site-link {
      margin-left: auto; font-size: 11px; color: var(--vscode-textLink-foreground);
      cursor: pointer; text-decoration: none; display: flex; align-items: center; gap: 4px;
    }
    .account-header .site-link img { width: 16px; height: 16px; border-radius: 4px; }
    h2 { font-size: 14px; font-weight: 600; margin: 0 0 4px; }
    .sub { color: var(--vscode-descriptionForeground); font-size: 11px; margin-bottom: 14px; }
    .card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
      background: var(--vscode-editor-background);
    }
    .btn {
      display: block;
      width: 100%;
      margin: 8px 0 0;
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      font-size: 13px;
      text-align: left;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-secondary {
      background: var(--vscode-input-background);
      color: var(--vscode-foreground);
      border-color: var(--vscode-input-border);
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-title { font-weight: 600; display: block; }
    .btn-desc { font-size: 11px; opacity: 0.85; margin-top: 2px; }
    input {
      width: 100%;
      padding: 8px 10px;
      margin: 6px 0;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-size: 13px;
    }
    label { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .row { display: flex; gap: 8px; margin-top: 8px; }
    .row .btn { flex: 1; margin: 0; text-align: center; }
    .status { font-size: 12px; padding: 8px; border-radius: 6px; margin-bottom: 10px; display: none; }
    .status.ok { display: block; background: rgba(0, 180, 80, 0.15); color: var(--vscode-testing-iconPassed); }
    .status.err { display: block; background: rgba(255, 80, 80, 0.12); color: var(--vscode-errorForeground); }
    .status.info { display: block; background: var(--vscode-editor-inactiveSelectionBackground); }
    .profile-email { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
    .stat { padding: 6px 0; border-top: 1px solid var(--vscode-panel-border); font-size: 12px; }
    .stat strong { color: var(--vscode-textLink-foreground); }
    #logged-in { display: none; }
    #logged-out { display: block; }
    body.authed #logged-in { display: block; }
    body.authed #logged-out { display: none; }
    .hidden { display: none !important; }
    .step-email { margin-top: 8px; }
  </style>
</head>
<body>
  <div class="account-header">
    <img id="brandLockup" alt="Nexus" />
    <a class="site-link" id="openSite" title="Открыть сайт Nexus">
      <img id="brandIcon" alt="" />
      <span>Сайт</span>
    </a>
  </div>
  <div id="status" class="status"></div>

  <div id="logged-out">
    <h2>Вход в Nexus</h2>
    <p class="sub" id="loginSub">Вход через Google — как на сайте Nexus. Пароль не нужен.</p>

    <div class="card" id="main-buttons">
      <button type="button" class="btn btn-primary" id="btnGoogle">
        <span class="btn-title">Продолжить с Google</span>
        <span class="btn-desc">Откроется браузер, затем вернётесь в IDE</span>
      </button>
      <button type="button" class="btn btn-secondary" id="btnEmail">
        <span class="btn-title">Код на email</span>
        <span class="btn-desc">6 цифр из письма на ваш Gmail</span>
      </button>
    </div>

    <div class="card step-email hidden" id="email-panel">
      <label for="email">Email</label>
      <input id="email" type="email" placeholder="you@gmail.com" autocomplete="email" />
      <div class="row">
        <button type="button" class="btn btn-secondary" id="btnBack">Назад</button>
        <button type="button" class="btn btn-primary" id="btnSendCode">Отправить код</button>
      </div>
      <div id="code-block" class="hidden">
        <label for="code">Код из письма</label>
        <input id="code" type="text" inputmode="numeric" maxlength="6" placeholder="000000" />
        <button type="button" class="btn btn-primary" id="btnVerify">Войти</button>
      </div>
    </div>
  </div>

  <div id="logged-in">
    <h2>Аккаунт</h2>
    <p class="profile-email" id="profileEmail"></p>
    <div class="card" id="profileStats"></div>
    <button type="button" class="btn btn-secondary" id="btnPricing">Тарифы и подписка</button>
    <button type="button" class="btn btn-secondary" id="btnSignOut">Выйти</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const statusEl = document.getElementById('status');
    const emailPanel = document.getElementById('email-panel');
    const mainButtons = document.getElementById('main-buttons');
    const codeBlock = document.getElementById('code-block');
    let pendingEmail = '';

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function setStatus(text, kind) {
      statusEl.textContent = text || '';
      statusEl.className = 'status' + (kind ? ' ' + kind : '');
      if (!text) statusEl.style.display = 'none';
      else statusEl.style.display = 'block';
    }

    function setBusy(busy) {
      document.querySelectorAll('button, input').forEach(el => { el.disabled = busy; });
    }

    document.getElementById('btnGoogle').onclick = () => {
      setStatus('Открываем браузер…', 'info');
      vscode.postMessage({ type: 'google' });
    };
    document.getElementById('btnEmail').onclick = () => {
      mainButtons.classList.add('hidden');
      emailPanel.classList.remove('hidden');
      setStatus('');
    };
    document.getElementById('btnBack').onclick = () => {
      emailPanel.classList.add('hidden');
      mainButtons.classList.remove('hidden');
      codeBlock.classList.add('hidden');
      setStatus('');
    };
    document.getElementById('btnSendCode').onclick = () => {
      const email = document.getElementById('email').value.trim();
      if (!email.includes('@')) { setStatus('Введите корректный email', 'err'); return; }
      pendingEmail = email;
      setBusy(true);
      setStatus('Отправляем код…', 'info');
      vscode.postMessage({ type: 'sendCode', email });
    };
    document.getElementById('btnVerify').onclick = () => {
      const code = document.getElementById('code').value.trim();
      if (!/^\\d{6}$/.test(code)) { setStatus('Введите 6 цифр из письма', 'err'); return; }
      setBusy(true);
      setStatus('Проверяем код…', 'info');
      vscode.postMessage({ type: 'verifyCode', email: pendingEmail, code });
    };
    document.getElementById('btnPricing').onclick = () => vscode.postMessage({ type: 'pricing' });
    document.getElementById('btnSignOut').onclick = () => {
      setBusy(true);
      vscode.postMessage({ type: 'signOut' });
    };

    window.addEventListener('message', e => {
      const m = e.data;
      setBusy(false);
      if (m.type === 'authState') {
        document.body.classList.toggle('authed', !!m.authorized);
        const btnGoogle = document.getElementById('btnGoogle');
        const btnEmail = document.getElementById('btnEmail');
        const loginSub = document.getElementById('loginSub');
        if (m.emailAuthEnabled === false) {
          btnEmail?.classList.add('hidden');
          if (loginSub) loginSub.textContent = 'Вход только через Google — один аккаунт на сайте и в IDE.';
        }
        if (m.googleEnabled === false) {
          btnGoogle.disabled = true;
          btnGoogle.querySelector('.btn-desc').textContent = 'Сейчас недоступно на сервере';
        }
      }
      if (m.type === 'status') setStatus(m.text, m.kind);
      if (m.type === 'codeSent') {
        codeBlock.classList.remove('hidden');
        setStatus('Код отправлен. Проверьте почту и «Спам».', 'ok');
      }
      if (m.type === 'profile') {
        document.getElementById('profileEmail').textContent = m.email || '';
        const stats = document.getElementById('profileStats');
        stats.innerHTML = (m.rows || []).map(r =>
          '<div class="stat"><strong>' + escapeHtml(r.label) + '</strong>' +
          (r.value ? ' — ' + escapeHtml(r.value) : '') + '</div>'
        ).join('');
      }
    });

    window.addEventListener('message', (e) => {
      const m = e.data;
      if (m.type === 'brand') {
        const lockup = document.getElementById('brandLockup');
        const icon = document.getElementById('brandIcon');
        if (lockup) lockup.src = m.logoFull || m.logo || '';
        if (icon) icon.src = m.logo || '';
      }
    });

    document.getElementById('openSite')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      vscode.postMessage({ type: 'openWeb' });
    });

    vscode.postMessage({ type: 'init' });
  </script>
</body>
</html>`;
}

class AccountWebviewProvider {
  /** @param {import('vscode').ExtensionContext} context */
  constructor(context) {
    this.context = context;
    this.view = null;
  }

  refresh() {
    const wv = this.view?.webview;
    if (wv) this.pushState(wv);
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    const mediaRoot = path.join(this.context.extensionPath, 'media');
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(mediaRoot)],
    };
    webviewView.webview.html = getAccountHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((msg) => this.onMessage(msg, webviewView.webview));
    this.pushBrand(webviewView.webview);
    this.pushState(webviewView.webview);
  }

  pushBrand(webview) {
    const uris = brandUrisForWebview(webview, this.context.extensionPath);
    this.post(webview, { type: 'brand', logo: uris.logo, logoFull: uris.logoFull });
  }

  post(webview, msg) {
    webview.postMessage(msg);
  }

  async pushState(webview) {
    const session = await auth.getSession();
    const config = await auth.fetchAuthConfig();
    this.post(webview, { type: 'webAppUrl', url: session.webAppUrl });
    this.post(webview, {
      type: 'authState',
      authorized: session.authorized,
      googleEnabled: config.google_oauth_enabled,
      emailAuthEnabled: config.email_auth_enabled !== false,
    });
    if (!session.authorized) return;

    try {
      const p = await auth.fetchProfile();
      const tier = p.subscription_tier || 'FREE';
      const capRub = p.monthly_cap_rub ?? p.monthly_quota_rub ?? 0;
      const spentRub = p.monthly_spent_rub ?? p.daily_spent_rub ?? 0;
      const remainingRub = p.monthly_remaining_rub ?? Math.max(0, capRub - spentRub);
      const rows = [{ label: 'Тариф', value: tier }];
      if (capRub > 0) {
        rows.push(
          { label: 'Пул ИИ', value: `${Math.round(spentRub)} / ${Math.round(capRub)} ₽` },
          { label: 'Остаток', value: `${Math.round(remainingRub)} ₽` }
        );
      } else if (tier === 'FREE') {
        rows.push({ label: 'Облачный ИИ', value: 'доступен с тарифа Hobby' });
      }
      this.post(webview, { type: 'profile', email: p.email, rows });
    } catch (e) {
      this.post(webview, { type: 'status', text: e.message, kind: 'err' });
    }
  }

  async onMessage(msg, webview) {
    try {
      if (msg.type === 'init') {
        await this.pushState(webview);
        return;
      }
      if (msg.type === 'google') {
        await auth.signInWithGoogle();
        this.post(webview, {
          type: 'status',
          text: 'Завершите вход в браузере и подтвердите открытие IDE',
          kind: 'info',
        });
        return;
      }
      if (msg.type === 'sendCode') {
        const cfg = await auth.fetchAuthConfig();
        if (cfg.email_auth_enabled === false) {
          throw new Error('Вход по email отключён. Используйте Google.');
        }
        await auth.requestEmailCode(msg.email);
        this.post(webview, { type: 'codeSent' });
        return;
      }
      if (msg.type === 'verifyCode') {
        await auth.verifyEmailCode(msg.email, msg.code);
        this.post(webview, { type: 'status', text: 'Вход выполнен', kind: 'ok' });
        await this.pushState(webview);
        return;
      }
      if (msg.type === 'signOut') {
        await auth.signOut();
        await this.pushState(webview);
        return;
      }
      if (msg.type === 'pricing') {
        const session = await auth.getSession();
        vscode.env.openExternal(vscode.Uri.parse(`${session.webAppUrl}/pricing`));
        return;
      }
      if (msg.type === 'openWeb') {
        const session = await auth.getSession();
        vscode.env.openExternal(vscode.Uri.parse(session.webAppUrl));
      }
    } catch (e) {
      this.post(webview, { type: 'status', text: e.message || String(e), kind: 'err' });
    }
  }
}

module.exports = { AccountWebviewProvider };
