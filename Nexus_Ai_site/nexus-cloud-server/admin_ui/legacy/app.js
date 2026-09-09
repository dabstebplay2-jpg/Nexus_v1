const PW_KEY = 'nexus_admin_pw';
const SERVER_KEY = 'nexus_admin_server';
const REFRESH_MS = 3000;

let liveTimer = null;
let currentUserId = null;
let activeTab = 'dashboard';

const RECOMMENDED_PORT = '8790';

const TITLES = {
  dashboard: 'Обзор',
  site: 'Сайт',
  users: 'Пользователи',
  transactions: 'Транзакции',
  invoices: 'Счета',
  logs: 'Логи сервера',
  audit: 'Действия админа',
  routerai: 'Polza.ai',
  support: 'Поддержка',
};

const SUPPORT_MAX_ATTACH = 4;
let supportSelectedId = null;
let supportReplyAttachments = [];

function pw() {
  return sessionStorage.getItem(PW_KEY) || '';
}

function setPw(v) {
  if (v) sessionStorage.setItem(PW_KEY, v);
  else sessionStorage.removeItem(PW_KEY);
}

function serverUrl() {
  const v = (sessionStorage.getItem(SERVER_KEY) || '').trim().replace(/\/$/, '');
  return v || window.location.origin;
}

function setServerUrl(v) {
  const clean = (v || '').trim().replace(/\/$/, '');
  if (clean) sessionStorage.setItem(SERVER_KEY, clean);
}

function isLocalOrigin(url) {
  try {
    const h = new URL(url).hostname;
    return h === '127.0.0.1' || h === 'localhost';
  } catch {
    return false;
  }
}

/** Админка открыта на Render — API на том же хосте, прокси только для localhost. */
function isHostedAdmin() {
  const h = window.location.hostname;
  return h.endsWith('.onrender.com');
}

function useCloudProxy() {
  if (isHostedAdmin()) return false;
  const target = serverUrl();
  const here = window.location.origin;
  return target.replace(/\/$/, '') !== here.replace(/\/$/, '') && !isLocalOrigin(target);
}

function apiBase() {
  if (useCloudProxy()) {
    return `${window.location.origin}/v1/admin-cloud-proxy`;
  }
  return `${serverUrl()}/v1/local-admin`;
}

function num(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

/** Разбор detail от FastAPI (строка или { message, diagnostics }). */
function formatApiError(res, text, parsed) {
  const d = parsed?.detail ?? parsed;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const lines = [];
    if (d.message) lines.push(d.message);
    else if (d.error) lines.push(String(d.error));
    const diag = d.diagnostics;
    if (diag) {
      if (diag.hint) lines.push(`Подсказка: ${diag.hint}`);
      if (diag.proxy_version) lines.push(`Прокси: v${diag.proxy_version}`);
      if (diag.upstream_url) lines.push(`URL: ${diag.upstream_url}`);
      if (diag.upstream_status != null) lines.push(`HTTP облака: ${diag.upstream_status}`);
      if (diag.starts_with_gzip_magic) {
        lines.push('Причина: ответ сжат gzip (старый сервер на :8787 или без прокси v2.1).');
      }
      if (diag.body_hex_first_16) lines.push(`Начало ответа (hex): ${diag.body_hex_first_16}`);
      if (diag.body_preview) lines.push(`Превью: ${String(diag.body_preview).slice(0, 100)}`);
      console.groupCollapsed('[Nexus Admin] Диагностика ошибки');
      console.table(diag);
      console.groupEnd();
    }
    return lines.join('\n') || JSON.stringify(d);
  }
  if (typeof d === 'string') return d;
  return `HTTP ${res.status}: ${text.slice(0, 200)}`;
}

function warnWrongPort() {
  const p = window.location.port;
  if (p && p !== RECOMMENDED_PORT) {
    return `Вы на порту :${p}. Запустите .\\scripts\\start_local_admin.ps1 (порт ${RECOMMENDED_PORT}) и откройте http://127.0.0.1:${RECOMMENDED_PORT}/local-admin/`;
  }
  return '';
}

async function probeProxyHealth(cloudUrl) {
  try {
    const r = await fetch(`${window.location.origin}/v1/admin-cloud-proxy/health`, {
      headers: cloudUrl ? { 'X-Cloud-Admin-Target': cloudUrl } : {},
    });
    const data = await r.json();
    console.info('[Nexus Admin] proxy health', data);
    return data;
  } catch (e) {
    console.warn('[Nexus Admin] proxy health failed', e);
    return null;
  }
}

async function api(path, opts = {}) {
  const headers = {
    'X-Admin-Password': pw(),
    Accept: 'application/json',
    ...(useCloudProxy() ? { 'X-Cloud-Admin-Target': serverUrl() } : {}),
    ...(opts.headers || {}),
  };
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }

  let res;
  try {
    res = await fetch(apiBase() + path, { ...opts, headers });
  } catch (e) {
    throw new Error(
      useCloudProxy()
        ? `Сеть: ${e.message}. Запустите локальный сервер (порт 8790): .\\scripts\\start_local_admin.ps1`
        : e.message
    );
  }

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const portHint = warnWrongPort();
      const hex = [...text.slice(0, 8)].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      const looksGzip = text.charCodeAt(0) === 0x1f && text.charCodeAt(1) === 0x8b;
      console.error('[Nexus Admin] JSON parse failed', {
        status: res.status,
        url: apiBase() + path,
        viaProxy: useCloudProxy(),
        contentType: res.headers.get('content-type'),
        bodyLen: text.length,
        hexStart: hex,
        looksGzip,
      });
      let msg = `Неверный ответ (не JSON), HTTP ${res.status}.`;
      if (looksGzip) {
        msg += ' Похоже на gzip — перезапустите start_local_admin.ps1 (порт 8790), Ctrl+F5.';
      } else {
        msg += ` Начало (hex): ${hex}. Откройте F12 → Console.`;
      }
      if (portHint) msg += `\n${portHint}`;
      throw new Error(msg);
    }
  }

  if (!res.ok) {
    const msg = formatApiError(res, text, data);
    const portHint = warnWrongPort();
    throw new Error(portHint ? `${msg}\n${portHint}` : msg);
  }
  return data;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function tierBadge(t) {
  const id = (t || 'FREE').toUpperCase();
  return `<span class="tier tier-${id}">${esc(id)}</span>`;
}

function setLivePill(ok, errMsg) {
  const el = document.getElementById('live-pill');
  const on = document.getElementById('live-enabled')?.checked;
  if (!on) {
    el.textContent = 'Пауза';
    el.classList.remove('live');
    return;
  }
  const t = new Date().toLocaleTimeString('ru-RU');
  if (ok) {
    el.textContent = `Онлайн ${t}`;
    el.classList.add('live');
  } else {
    el.textContent = errMsg ? `Ошибка ${t}` : `Офлайн ${t}`;
    el.classList.remove('live');
  }
}

function stopLive() {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
}

function startLive() {
  stopLive();
  if (!document.getElementById('live-enabled')?.checked) return;
  liveTimer = setInterval(() => refreshActiveTab(true), REFRESH_MS);
}

function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

async function refreshActiveTab(silent) {
  let errMsg = '';
  try {
    if (activeTab === 'dashboard') await loadDashboard(silent);
    else if (activeTab === 'site') await loadSiteOverview(silent);
    else if (activeTab === 'users') await loadUsers(silent);
    else if (activeTab === 'transactions') await loadTransactions(silent);
    else if (activeTab === 'invoices') await loadInvoices(silent);
    else if (activeTab === 'logs') await loadLogs(silent);
    else if (activeTab === 'audit') await loadAudit(silent);
    else if (activeTab === 'support') await loadSupport(silent);
    else if (activeTab === 'routerai') await loadRouterai(silent);
    if (activeTab === 'dashboard' || activeTab === 'users') {
      await loadStatus().catch(() => {});
    }
    setLivePill(true);
  } catch (e) {
    errMsg = e.message;
    setLivePill(false, errMsg);
    if (!silent) console.warn(e);
  }
}

async function loadBootstrap() {
  const portWarn = warnWrongPort();
  if (portWarn) {
    const el = document.getElementById('login-error');
    el.textContent = portWarn;
    el.classList.remove('hidden');
  }
  try {
    const res = await fetch('/local-admin/bootstrap.json');
    if (res.ok) {
      const b = await res.json();
      if (isHostedAdmin()) {
        document.getElementById('login-server').value = window.location.origin;
        setServerUrl(window.location.origin);
      } else if (b.defaultCloudUrl && !sessionStorage.getItem(SERVER_KEY)) {
        document.getElementById('login-server').value = b.defaultCloudUrl;
      }
      if (b.proxyVersion) {
        console.info(`[Nexus Admin] UI loaded | proxy v${b.proxyVersion} | port ${window.location.port || 'default'}`);
      }
      const cloud = document.getElementById('login-server').value.trim();
      if (cloud) await probeProxyHealth(cloud);
    }
  } catch {
    /* ignore */
  }
  const saved = sessionStorage.getItem(SERVER_KEY);
  if (saved) document.getElementById('login-server').value = saved;
  else if (!document.getElementById('login-server').value) {
    document.getElementById('login-server').value = 'https://nexus-zeta-ruby-12.vercel.app/api';
  }
}

loadBootstrap();

document.getElementById('login-btn').addEventListener('click', tryLogin);
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryLogin();
});

async function tryLogin() {
  const el = document.getElementById('login-error');
  el.classList.add('hidden');
  const cloud = isHostedAdmin()
    ? window.location.origin
    : document.getElementById('login-server').value.trim();
  setServerUrl(cloud);
  setPw(document.getElementById('login-password').value);

  if (!isHostedAdmin()) {
    const health = await probeProxyHealth(cloud);
    if (health && !health.cloud_admin_api) {
      el.textContent = health.hint || 'Админ-API на Render не найден (404). Проверьте NEXUS_REMOTE_ADMIN.';
      el.classList.remove('hidden');
      return;
    }
  }

  try {
    await api('/status');
    showApp();
  } catch (e) {
    setPw('');
    el.style.whiteSpace = 'pre-wrap';
    el.textContent = e.message;
    el.classList.remove('hidden');
  }
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('server-label').textContent = serverUrl();
  loadStatus();
  showTab('dashboard');
  startLive();
}

document.getElementById('logout-btn').addEventListener('click', () => {
  stopLive();
  setPw('');
  location.reload();
});

document.getElementById('live-enabled').addEventListener('change', () => {
  if (document.getElementById('live-enabled').checked) startLive();
  else stopLive();
});

if (pw() && sessionStorage.getItem(SERVER_KEY)) {
  api('/status').then(showApp).catch(() => setPw(''));
}

document.querySelectorAll('.nav').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

function showTab(name) {
  activeTab = name;
  document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.add('hidden'));
  document.getElementById(`tab-${name}`).classList.remove('hidden');
  document.getElementById('page-title').textContent = TITLES[name] || name;
  refreshActiveTab(false);
}

async function loadStatus() {
  try {
    const s = await api('/status');
    const src = s.remote_admin ? 'Render' : 'локально';
    let rai = 'нет';
    if (s.routerai_master_configured) {
      rai = s.routerai_master_valid ? 'мастер OK' : 'мастер ✗';
    }
    document.getElementById('status-pill').textContent = `${src} | Polza: ${rai}`;
    document.getElementById('status-pill').title = s.routerai_master_hint || '';
  } catch {
    document.getElementById('status-pill').textContent = 'нет связи';
  }
}

async function loadSiteOverview(silent) {
  try {
    const s = await api('/site-overview');
    const st = await api('/status').catch(() => ({}));
    document.getElementById('site-overview').innerHTML = `
      <div class="site-card"><div class="val">${num(s.users_total)}</div><div class="lbl">Пользователей</div></div>
      <div class="site-card"><div class="val">${num(s.users_with_polza_key ?? s.users_with_routerai_key)}</div><div class="lbl">С ключом Polza</div></div>
      <div class="site-card"><div class="val">${num(s.users_paid_tier)}</div><div class="lbl">Платный тариф</div></div>
      <div class="site-card"><div class="val ${st.routerai_master_valid ? '' : 'error-text'}">${
      !st.routerai_master_configured ? '—' : st.routerai_master_valid ? 'OK' : '401'
    }</div><div class="lbl" title="${esc(st.routerai_master_hint || '')}">Polza backend</div></div>
      <div class="site-card"><div class="val">${st.remote_admin ? 'да' : 'нет'}</div><div class="lbl">Remote admin</div></div>
      <div class="site-card"><div class="val">${st.testing_mode ? 'тест' : 'прод'}</div><div class="lbl">Режим</div></div>
    `;
    const links = document.createElement('p');
    links.className = 'muted';
    const front = s.frontend_url || 'https://nexus-zeta-ruby-12.vercel.app';
    const cloud = s.cloud_url || serverUrl();
    links.innerHTML = `Сайт: <a href="${front}" target="_blank" rel="noopener">Vercel</a> · API: <a href="${cloud}" target="_blank" rel="noopener">Render</a>`;
    const box = document.getElementById('site-overview');
    if (!box.querySelector('.site-links')) {
      links.classList.add('site-links');
      box.after(links);
    }
  } catch (e) {
    document.getElementById('site-overview').innerHTML = `<p class="error">${esc(e.message)}</p>`;
    if (!silent) throw e;
  }
}

function fmtRub(v) {
  return `${Math.round(num(v)).toLocaleString('ru-RU')} ₽`;
}

function renderFundingPanel(el, f) {
  if (!el || !f) return;
  const ok = f.funding_ok;
  const frac = Math.round(num(f.tier_pool_fraction, 0.92) * 100);
  const topup = num(f.recommended_topup_rub);
  el.className = `funding-panel ${ok ? 'ok' : 'warn'}`;
  el.innerHTML = `
    <h3>Polza.ai: баланс org и подписки ${ok ? '✓' : '⚠ пополните'}</h3>
    <div class="funding-grid">
      <div><div class="lbl">Баланс org Polza</div><div class="val">${fmtRub(f.polza_org_balance_rub ?? f.routerai_deposit_rub)}</div></div>
      <div><div class="lbl">Под подписки (пулы)</div><div class="val">${fmtRub(f.reserved_pool_rub)}</div></div>
      <div><div class="lbl">Пополнить для подписок</div><div class="val" style="color:${topup > 0 ? 'var(--warn)' : 'inherit'}">${topup > 0 ? fmtRub(topup) : '—'}</div></div>
      <div><div class="lbl">ЮKassa за месяц</div><div class="val">${num(f.received_rub_month).toLocaleString('ru-RU')} ₽</div></div>
      <div><div class="lbl">Подписчиков</div><div class="val">${num(f.active_subscribers)}</div></div>
    </div>
    <p class="muted small">Подписка ~$20 → на пул пользователю ${frac}% (~$18.40). Курс: ${num(f.usd_rub_rate).toFixed(2)} ₽/$</p>
    <p class="muted small">После пополнения org-баланса Polza укажите актуальную сумму (₽):</p>
    <div class="funding-deposit-row">
      <input type="number" step="1" min="0" id="funding-deposit-input-${el.id}" value="${Math.round(num(f.routerai_deposit_rub))}" />
      <button type="button" data-save-deposit="${el.id}">Сохранить баланс ₽</button>
    </div>
  `;
  el.querySelector(`[data-save-deposit="${el.id}"]`)?.addEventListener('click', () => saveRouteraiDeposit(el.id));
}

async function saveRouteraiDeposit(panelId) {
  const input = document.getElementById(`funding-deposit-input-${panelId}`);
  const v = num(input?.value, -1);
  if (v < 0) return;
  try {
    await api('/platform/polza-deposit', { method: 'PATCH', body: { deposit_rub: v } });
    await loadFundingPanels();
    if (activeTab === 'routerai') await loadRouterai(false);
  } catch (e) {
    alert(e.message);
  }
}

async function loadFundingPanels(silent) {
  try {
    const f = await api('/platform/funding');
    renderFundingPanel(document.getElementById('dash-funding'), f);
    renderFundingPanel(document.getElementById('rai-funding'), f);
  } catch (e) {
    const msg = `<p class="error">${esc(e.message)}</p>`;
    ['dash-funding', 'rai-funding'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = msg;
    });
    if (!silent) throw e;
  }
}

async function loadDashboard(silent) {
  try {
    await loadFundingPanels(true);
    const d = await api('/dashboard');
    if (typeof d.users_total === 'undefined' && !d.recent_users) {
      throw new Error('Пустой ответ /dashboard. Перезапустите локальный сервер.');
    }
    const tiers = Object.entries(d.users_by_tier || {})
      .map(([t, c]) => `${t}: ${c}`)
      .join(' · ') || '—';
    document.getElementById('dash-cards').innerHTML = `
      <div class="card"><div class="val">${num(d.users_total)}</div><div class="lbl">Всего</div></div>
      <div class="card"><div class="val">${num(d.transactions_total)}</div><div class="lbl">Транзакции</div></div>
      <div class="card"><div class="val">${num(d.invoices_pending)}</div><div class="lbl">Счета pending</div></div>
      <div class="card"><div class="val" style="font-size:0.85rem">${esc(tiers)}</div><div class="lbl">Тарифы</div></div>
    `;
    document.getElementById('dash-recent').innerHTML = usersTable(d.recent_users || [], true);
  } catch (e) {
    document.getElementById('dash-cards').innerHTML = `<p class="error">${esc(e.message)}</p>`;
    document.getElementById('dash-recent').innerHTML = '';
    if (!silent) throw e;
  }
}

function usersTable(items, compact) {
  if (!items.length) return '<p class="muted">Нет данных</p>';
  const rows = items
    .map((u) => {
      const btn = compact
        ? ''
        : `<td><button type="button" class="btn-link" data-open="${u.id}">Открыть</button></td>`;
      return `<tr>
        <td>${u.id}</td>
        <td>${esc(u.email)}</td>
        <td>${tierBadge(u.subscription_tier)}</td>
        <td title="${esc(u.polza_key_preview || u.routerai_key_preview || '')}">${(u.has_polza_key ?? u.has_routerai_key) ? ((u.polza_ready ?? u.routerai_ready) ? 'активен' : 'есть') : '—'}</td>
        <td>$${num(u.monthly_remaining_usd).toFixed(2)}</td>
        <td>${esc((u.created_at || '').slice(0, 10))}</td>
        ${btn}
      </tr>`;
    })
    .join('');
  const actions = compact ? '' : '<th></th>';
  return `<table>
    <thead><tr><th>ID</th><th>Email</th><th>Тариф</th><th>Polza</th><th>Остаток</th><th>Создан</th>${actions}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function loadUsers() {
  const q = document.getElementById('user-search').value.trim();
  const tier = document.getElementById('user-tier-filter').value;
  const params = new URLSearchParams({ limit: '500' });
  if (q) params.set('q', q);
  if (tier) params.set('tier', tier);
  const data = await api(`/users?${params}`);
  const el = document.getElementById('users-table');
  el.innerHTML =
    `<p class="muted">Всего: ${num(data.total)} · обновлено ${new Date().toLocaleTimeString('ru-RU')}</p>` +
    usersTable(data.items || [], false);
  el.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => openUser(Number(btn.dataset.open)));
  });
}

document.getElementById('user-refresh').addEventListener('click', () => loadUsers());
document.getElementById('user-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadUsers();
});
document.getElementById('user-tier-filter').addEventListener('change', () => loadUsers());

async function loadTransactions() {
  const data = await api('/transactions?limit=200');
  const rows = (data.items || [])
    .map(
      (t) => `<tr>
        <td>${t.id}</td>
        <td>${esc(t.email)}</td>
        <td>${esc(t.tx_type)}</td>
        <td>$${Number(t.amount_usd).toFixed(4)}</td>
        <td>${esc(t.description)}</td>
        <td>${esc((t.created_at || '').slice(0, 19))}</td>
      </tr>`
    )
    .join('');
  document.getElementById('tx-table').innerHTML = `<table>
    <thead><tr><th>ID</th><th>Email</th><th>Тип</th><th>USD</th><th>Описание</th><th>Дата</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">Пусто</td></tr>'}</tbody>
  </table>`;
}

async function loadInvoices() {
  const data = await api('/invoices?limit=200');
  const rows = (data.items || [])
    .map(
      (i) => `<tr>
        <td>${esc(i.id)}</td>
        <td>${esc(i.email)}</td>
        <td>${esc(i.status)}</td>
        <td>${Number(i.amount_rub).toFixed(0)} ₽</td>
        <td>${esc((i.created_at || '').slice(0, 19))}</td>
      </tr>`
    )
    .join('');
  document.getElementById('inv-table').innerHTML = `<table>
    <thead><tr><th>ID</th><th>Email</th><th>Статус</th><th>Сумма</th><th>Дата</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">Пусто</td></tr>'}</tbody>
  </table>`;
}

async function loadLogs() {
  const level = document.getElementById('log-level').value;
  const q = document.getElementById('log-search').value.trim();
  const params = new URLSearchParams({ limit: '400' });
  if (level) params.set('level', level);
  if (q) params.set('q', q);
  const data = await api(`/logs/server?${params}`);
  const lines = (data.items || [])
    .map((l) => {
      const cls = `log-${l.level}`;
      return `<span class="${cls}">[${esc(l.at?.slice(11, 19))}] ${esc(l.level)} ${esc(l.logger)}: ${esc(l.message)}</span>`;
    })
    .join('\n');
  const el = document.getElementById('log-view');
  el.innerHTML = lines || '(на Render логи сбрасываются после перезапуска)';
  el.scrollTop = el.scrollHeight;
}

document.getElementById('log-refresh').addEventListener('click', () => loadLogs());

async function loadAudit() {
  const data = await api('/logs/admin-actions?limit=150');
  const rows = (data.items || [])
    .map(
      (a) => `<tr>
        <td>${esc((a.at || '').slice(0, 19))}</td>
        <td>${esc(a.action)}</td>
        <td>${esc(a.detail)}</td>
      </tr>`
    )
    .join('');
  document.getElementById('audit-table').innerHTML = `<table>
    <thead><tr><th>Время</th><th>Действие</th><th>Детали</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3">Пусто</td></tr>'}</tbody>
  </table>`;
}

async function loadRouterai(silent) {
  try {
    await loadFundingPanels(true);
    const [pool, keys] = await Promise.all([
      api('/polza/pool-status').catch(() => null),
    ]);
    const parts = [];
    if (pool) parts.push('=== pool-status ===\n' + JSON.stringify(pool, null, 2));
    parts.push('=== keys ===\n' + JSON.stringify(keys, null, 2));
    document.getElementById('rai-view').textContent = parts.join('\n\n');
  } catch (e) {
    document.getElementById('rai-view').textContent = e.message;
    if (!silent) throw e;
  }
}

const SUPPORT_CAT = {
  complaint: 'Жалоба',
  question: 'Вопрос',
  bug: 'Баг',
  other: 'Другое',
};

function supportStatusBadge(status) {
  const s = (status || '').toLowerCase();
  const cls = s === 'closed' ? 'badge-muted' : s === 'answered' ? 'badge-ok' : 'badge-warn';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

async function resizeImageDataUrl(dataUrl, maxDim = 2048) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) return resolve(dataUrl);
      const scale = maxDim / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => reject(new Error('Некорректное изображение'));
    img.src = dataUrl;
  });
}

async function fileToSupportAttachment(file) {
  const mime = file.type || 'image/jpeg';
  const reader = new FileReader();
  const dataUrl = await new Promise((res, rej) => {
    reader.onload = () => res(reader.result);
    reader.onerror = () => rej(new Error(`Не удалось прочитать «${file.name}»`));
    reader.readAsDataURL(file);
  });
  const resized = await resizeImageDataUrl(String(dataUrl));
  const base64 = resized.includes(',') ? resized.split(',')[1] : resized;
  return { kind: 'image', name: file.name, mime: mime.startsWith('image/') ? mime : 'image/jpeg', data_base64: base64 };
}

function renderSupportReplyAttach() {
  const el = document.getElementById('support-reply-attach');
  if (!el) return;
  if (!supportReplyAttachments.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = supportReplyAttachments
    .map(
      (a, i) => `
    <span class="support-att-chip">${esc(a.name)}
      <button type="button" data-i="${i}" class="support-att-rm">×</button>
    </span>`
    )
    .join('');
  el.querySelectorAll('.support-att-rm').forEach((btn) => {
    btn.addEventListener('click', () => {
      supportReplyAttachments.splice(Number(btn.dataset.i), 1);
      renderSupportReplyAttach();
    });
  });
}

function renderSupportMessage(m) {
  const who = m.author === 'admin' ? 'Админ' : 'Пользователь';
  const cls = m.author === 'admin' ? 'admin' : 'user';
  let attHtml = '';
  for (const a of m.attachments || []) {
    if (a.kind === 'image' && a.preview_url) {
      attHtml += `<a href="${a.preview_url}" target="_blank" rel="noopener"><img class="support-img" src="${a.preview_url}" alt="${esc(a.name)}" /></a>`;
    } else if (a.text_preview) {
      attHtml += `<pre class="support-file-preview">${esc(a.text_preview)}</pre>`;
    }
  }
  return `
    <div class="support-msg ${cls}">
      <div class="support-msg-head">${esc(who)} · ${esc((m.created_at || '').slice(0, 19).replace('T', ' '))}</div>
      <div class="support-msg-body">${esc(m.body)}</div>
      ${attHtml ? `<div class="support-msg-att">${attHtml}</div>` : ''}
    </div>`;
}

async function loadSupportTicketDetail(ticketId, silent) {
  const data = await api(`/support/tickets/${encodeURIComponent(ticketId)}`);
  supportSelectedId = ticketId;
  document.getElementById('support-detail-empty').classList.add('hidden');
  document.getElementById('support-detail').classList.remove('hidden');
  document.getElementById('support-subject').textContent = data.subject || '—';
  document.getElementById('support-meta').innerHTML = `
    ${esc(data.user_email)} · ${supportStatusBadge(data.status)}
    · ${esc(SUPPORT_CAT[data.category] || data.category)}
    · ${esc((data.updated_at || '').slice(0, 19).replace('T', ' '))}
  `;
  const closed = (data.status || '').toLowerCase() === 'closed';
  document.getElementById('support-close-ticket').classList.toggle('hidden', closed);
  document.getElementById('support-reopen-ticket').classList.toggle('hidden', !closed);
  document.getElementById('support-thread').innerHTML = (data.messages || []).map(renderSupportMessage).join('');
  document.querySelectorAll('#support-tickets-table tr[data-id]').forEach((tr) => {
    tr.classList.toggle('active', tr.dataset.id === ticketId);
  });
  if (!silent) {
    const thread = document.getElementById('support-thread');
    thread.scrollTop = thread.scrollHeight;
  }
}

async function loadSupport(silent) {
  const status = document.getElementById('support-status-filter')?.value || '';
  const q = document.getElementById('support-search')?.value?.trim() || '';
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (q) qs.set('q', q);
  const suffix = qs.toString() ? `?${qs}` : '';
  const data = await api(`/support/tickets${suffix}`);
  const tickets = data.tickets || [];
  const wrap = document.getElementById('support-tickets-table');
  if (!tickets.length) {
    wrap.innerHTML = '<p class="muted">Обращений нет</p>';
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>Дата</th><th>Email</th><th>Кат.</th><th>Статус</th><th>Тема</th>
      </tr></thead>
      <tbody>
        ${tickets
          .map(
            (t) => `
          <tr data-id="${esc(t.id)}" class="${t.id === supportSelectedId ? 'active' : ''}">
            <td>${esc((t.updated_at || t.created_at || '').slice(0, 16).replace('T', ' '))}</td>
            <td>${esc(t.user_email)}</td>
            <td>${esc(SUPPORT_CAT[t.category] || t.category)}</td>
            <td>${supportStatusBadge(t.status)}</td>
            <td>${esc(t.subject)}${t.last_preview ? `<div class="muted small">${esc(t.last_preview.slice(0, 80))}</div>` : ''}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
  wrap.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', () => {
      loadSupportTicketDetail(tr.dataset.id, false).catch((e) => {
        if (!silent) showToast(e.message, true);
      });
    });
  });
  if (supportSelectedId && tickets.some((t) => t.id === supportSelectedId)) {
    await loadSupportTicketDetail(supportSelectedId, true);
  }
}

document.getElementById('support-refresh')?.addEventListener('click', () => loadSupport(false));
document.getElementById('support-status-filter')?.addEventListener('change', () => loadSupport(false));
document.getElementById('support-search')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadSupport(false);
});

document.getElementById('support-file-input')?.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  try {
    for (const file of files) {
      if (supportReplyAttachments.length >= SUPPORT_MAX_ATTACH) {
        showToast(`Не более ${SUPPORT_MAX_ATTACH} вложений`, true);
        break;
      }
      supportReplyAttachments.push(await fileToSupportAttachment(file));
    }
    renderSupportReplyAttach();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('support-send-reply')?.addEventListener('click', async () => {
  if (!supportSelectedId) return;
  const body = document.getElementById('support-reply-body').value.trim();
  if (!body && !supportReplyAttachments.length) {
    showToast('Введите текст или прикрепите фото', true);
    return;
  }
  try {
    await api(`/support/tickets/${encodeURIComponent(supportSelectedId)}/reply`, {
      method: 'POST',
      body: { body: body || '—', attachments: supportReplyAttachments },
    });
    document.getElementById('support-reply-body').value = '';
    supportReplyAttachments = [];
    renderSupportReplyAttach();
    showToast('Ответ отправлен');
    await loadSupport(false);
  } catch (e) {
    showToast(e.message, true);
  }
});

async function patchSupportStatus(status) {
  if (!supportSelectedId) return;
  await api(`/support/tickets/${encodeURIComponent(supportSelectedId)}`, {
    method: 'PATCH',
    body: { status },
  });
  showToast(status === 'closed' ? 'Тикет закрыт' : 'Тикет открыт');
  await loadSupport(false);
}

document.getElementById('support-close-ticket')?.addEventListener('click', () => {
  if (!supportSelectedId || !confirm('Закрыть обращение?')) return;
  patchSupportStatus('closed').catch((e) => showToast(e.message, true));
});

document.getElementById('support-reopen-ticket')?.addEventListener('click', () => {
  if (!supportSelectedId) return;
  patchSupportStatus('open').catch((e) => showToast(e.message, true));
});

document.getElementById('rai-refresh').addEventListener('click', () => loadRouterai());
document.getElementById('rai-funding-check').addEventListener('click', async () => {
  try {
    const r = await api('/platform/funding-check', { method: 'POST' });
    alert(r.alert_sent ? 'Алерт отправлен в Discord ops' : 'Депозит в норме или алерт на cooldown');
    await loadRouterai();
  } catch (e) {
    alert(e.message);
  }
});

const dialog = document.getElementById('user-dialog');

async function openUser(id) {
  currentUserId = id;
  const data = await api(`/users/${id}`);
  const u = data.user;
  document.getElementById('ud-title').textContent = `Пользователь #${u.id}`;
  document.getElementById('ud-tier').value = u.subscription_tier;
  document.getElementById('ud-balance').value = u.balance_usd;
  document.getElementById('ud-email').value = u.email;
  document.getElementById('ud-password').value = '';
  document.getElementById('ud-refresh-routerai').checked = false;
  document.getElementById('ud-manual-key').value = '';
  document.getElementById('ud-manual-key-id').value = '';
  const hasKey = u.has_polza_key ?? u.has_routerai_key;
  const keyReady = u.polza_ready ?? u.routerai_ready;
  const keyLine = hasKey
    ? `Polza: ${esc(u.polza_key_preview || u.routerai_key_preview || 'привязан')}${keyReady ? ' · ИИ активен' : ' · ждёт оплаты/тарифа'}`
    : 'Ключ Polza: не создан — отметьте «Обновить ключ» и Сохранить';
  document.getElementById('ud-status').innerHTML = `
    ${esc(u.email)} · ${tierBadge(u.subscription_tier)}<br>
    ${keyLine}<br>
    Квота: $${num(u.monthly_spent_usd).toFixed(2)} / $${num(u.monthly_cap_usd).toFixed(2)}
  `;
  document.getElementById('ud-extra').textContent = JSON.stringify(
    { transactions: data.transactions, invoices: data.invoices },
    null,
    2
  );
  const msg = document.getElementById('ud-save-msg');
  msg.classList.add('hidden');
  msg.textContent = '';
  dialog.showModal();
}

document.getElementById('ud-close').addEventListener('click', () => dialog.close());

async function act(fn) {
  try {
    await fn();
    await openUser(currentUserId);
    await refreshActiveTab(true);
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById('ud-save').addEventListener('click', async () => {
  const msgEl = document.getElementById('ud-save-msg');
  const pw = document.getElementById('ud-password').value.trim();
  const body = {
    email: document.getElementById('ud-email').value.trim(),
    subscription_tier: document.getElementById('ud-tier').value,
    balance_usd: Number(document.getElementById('ud-balance').value),
    refresh_routerai: document.getElementById('ud-refresh-routerai').checked,
  };
  const manualKey = document.getElementById('ud-manual-key').value.trim();
  const manualKeyId = document.getElementById('ud-manual-key-id').value.trim();
  if (manualKey) {
    body.manual_routerai_api_key = manualKey;
    if (manualKeyId) body.manual_routerai_key_id = manualKeyId;
  }
  if (pw.length >= 6) body.new_password = pw;

  try {
    const res = await api(`/users/${currentUserId}`, { method: 'PUT', body });
    const warn = (res.warnings || []).filter(Boolean);
    msgEl.textContent = [
      `Сохранено: ${(res.changes || []).join(', ') || 'ok'}`,
      ...warn.map((w) => `⚠ ${w}`),
    ].join('\n');
    msgEl.classList.remove('hidden', 'error', 'warn');
    if (warn.length) msgEl.classList.add('warn');
    showToast(warn[0] || 'Настройки пользователя сохранены', Boolean(warn.length));
    await openUser(currentUserId);
    await refreshActiveTab(true);
  } catch (e) {
    msgEl.textContent = e.message;
    msgEl.classList.remove('hidden');
    msgEl.classList.add('error');
    showToast(e.message, true);
  }
});

document.getElementById('ud-revoke').addEventListener('click', () => {
  if (!confirm('Сбросить тариф на FREE?')) return;
  document.getElementById('ud-tier').value = 'FREE';
  document.getElementById('ud-save').click();
});

document.getElementById('ud-delete').addEventListener('click', () => {
  if (!confirm('Удалить аккаунт безвозвратно?')) return;
  api(`/users/${currentUserId}`, { method: 'DELETE' })
    .then(() => {
      dialog.close();
      refreshActiveTab(false);
    })
    .catch((e) => alert(e.message));
});
