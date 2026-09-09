const { randomBytes } = require('crypto');

function getSupportPanelHtml() {
  const nonce = randomBytes(18).toString('base64');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data: blob:;" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 12px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    h1 { margin: 0 0 12px; font-size: 15px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 12px; }
    .tabs button {
      padding: 6px 12px; border-radius: 8px; cursor: pointer;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-foreground);
    }
    .tabs button.active { border-color: var(--vscode-focusBorder); color: var(--vscode-textLink-foreground); }
    label { display: block; font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
    input, select, textarea {
      width: 100%; margin-top: 4px; padding: 8px; border-radius: 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: inherit;
    }
    textarea { min-height: 100px; resize: vertical; }
    .btn {
      padding: 9px 14px; border-radius: 8px; cursor: pointer; border: none;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-weight: 600;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .list { display: flex; flex-direction: column; gap: 8px; max-height: 70vh; overflow-y: auto; }
    .ticket {
      text-align: left; padding: 10px; border-radius: 8px; cursor: pointer;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    .ticket:hover { border-color: var(--vscode-focusBorder); }
    .ticket .sub { font-weight: 600; }
    .ticket .meta { font-size: 10px; opacity: 0.75; margin-top: 4px; }
    .thread { display: flex; flex-direction: column; gap: 8px; max-height: 50vh; overflow-y: auto; margin: 12px 0; }
    .msg { padding: 8px 10px; border-radius: 8px; max-width: 92%; white-space: pre-wrap; }
    .msg.user { align-self: flex-start; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
    .msg.admin { align-self: flex-end; background: rgba(0,120,200,0.15); border: 1px solid var(--vscode-focusBorder); }
    .msg .who { font-size: 10px; opacity: 0.7; margin-bottom: 4px; }
    .msg img { max-width: 160px; max-height: 100px; border-radius: 6px; margin-top: 6px; display: block; }
    .att-strip { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .att-chip { font-size: 10px; padding: 4px 8px; border-radius: 6px; background: var(--vscode-badge-background); }
    .err { color: var(--vscode-errorForeground); font-size: 12px; margin-bottom: 8px; }
    .back { background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; padding: 0; margin-bottom: 8px; }
    #fileIn { display: none; }
  </style>
</head>
<body>
  <h1>Поддержка Nexus</h1>
  <div class="tabs">
    <button type="button" id="tabList" class="active">Мои обращения</button>
    <button type="button" id="tabNew">Новое</button>
  </div>
  <p id="err" class="err hidden"></p>

  <div id="viewList">
    <div class="list" id="ticketList"></div>
  </div>

  <div id="viewNew" class="hidden">
    <label>Тип
      <select id="category">
        <option value="question">Вопрос</option>
        <option value="complaint">Жалоба</option>
        <option value="bug">Баг</option>
        <option value="other">Другое</option>
      </select>
    </label>
    <label>Тема <input id="subject" maxlength="200" /></label>
    <label>Текст <textarea id="body"></textarea></label>
    <div class="att-strip" id="newAtt"></div>
    <button type="button" class="btn" id="pickNew">📎 Вложение</button>
    <button type="button" class="btn" id="sendNew" style="margin-top:12px;width:100%">Отправить</button>
  </div>

  <div id="viewThread" class="hidden">
    <button type="button" class="back" id="backList">← К списку</button>
    <div id="threadHead"></div>
    <div class="thread" id="thread"></div>
    <div id="replyBox">
      <textarea id="replyBody" rows="3" placeholder="Сообщение…"></textarea>
      <div class="att-strip" id="replyAtt"></div>
      <button type="button" id="pickReply">📎</button>
      <button type="button" class="btn" id="sendReply" style="margin-top:8px">Отправить</button>
    </div>
  </div>

  <input type="file" id="fileIn" multiple accept="image/jpeg,image/png,image/webp,image/gif,.txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.css,.html,.xml,.yaml,.yml,.csv,.log" />

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const MAX_ATT = 4;
    let view = 'list';
    let tickets = [];
    let currentId = null;
    let newAtt = [];
    let replyAtt = [];
    let pickTarget = 'new';

    const STATUS = { open: 'Открыто', answered: 'Есть ответ', closed: 'Закрыто' };

    function showErr(t) {
      const el = document.getElementById('err');
      if (!t) { el.classList.add('hidden'); el.textContent = ''; return; }
      el.textContent = t;
      el.classList.remove('hidden');
    }

    function setView(v) {
      view = v;
      document.getElementById('viewList').classList.toggle('hidden', v !== 'list');
      document.getElementById('viewNew').classList.toggle('hidden', v !== 'new');
      document.getElementById('viewThread').classList.toggle('hidden', v !== 'thread');
      document.getElementById('tabList').classList.toggle('active', v === 'list' || v === 'thread');
      document.getElementById('tabNew').classList.toggle('active', v === 'new');
    }

    function renderAttStrip(el, att, onRemove) {
      el.innerHTML = att.map((a, i) =>
        '<span class="att-chip">' + escapeHtml(a.name) + ' <button type="button" data-i="' + i + '">×</button></span>'
      ).join('');
      el.querySelectorAll('button').forEach((b) => {
        b.onclick = () => { onRemove(Number(b.dataset.i)); };
      });
    }

    function renderNewAttachments() {
      renderAttStrip(document.getElementById('newAtt'), newAtt, (i) => {
        newAtt.splice(i, 1);
        renderNewAttachments();
      });
    }

    function renderReplyAttachments() {
      renderAttStrip(document.getElementById('replyAtt'), replyAtt, (i) => {
        replyAtt.splice(i, 1);
        renderReplyAttachments();
      });
    }

    async function resizeDataUrl(dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const max = 2048;
          let w = img.width, h = img.height;
          if (w <= max && h <= max) return resolve(dataUrl);
          const s = max / Math.max(w, h);
          w = Math.round(w * s); h = Math.round(h * s);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.88));
        };
        img.onerror = () => reject(new Error('bad image'));
        img.src = dataUrl;
      });
    }

    async function fileToAtt(file) {
      const mime = file.type || 'application/octet-stream';
      if (mime.startsWith('image/') || /\\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = () => rej(new Error(file.name));
          r.readAsDataURL(file);
        });
        const resized = await resizeDataUrl(String(dataUrl));
        const b64 = resized.split(',')[1];
        return { kind: 'image', name: file.name, mime: mime.startsWith('image/') ? mime : 'image/jpeg', dataBase64: b64 };
      }
      const text = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result || ''));
        r.onerror = () => rej(new Error(file.name));
        r.readAsText(file);
      });
      return { kind: 'file', name: file.name, mime, text: text.slice(0, 32000) };
    }

    document.getElementById('fileIn').onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      const target = pickTarget === 'reply' ? replyAtt : newAtt;
      try {
        for (const f of files) {
          if (target.length >= MAX_ATT) break;
          target.push(await fileToAtt(f));
        }
        if (pickTarget === 'reply') {
          renderReplyAttachments();
        } else {
          renderNewAttachments();
        }
      } catch (err) { showErr(err.message); }
    };

    document.getElementById('pickNew').onclick = () => { pickTarget = 'new'; document.getElementById('fileIn').click(); };
    document.getElementById('pickReply').onclick = () => { pickTarget = 'reply'; document.getElementById('fileIn').click(); };

    function renderList() {
      const el = document.getElementById('ticketList');
      if (!tickets.length) {
        el.innerHTML = '<p style="opacity:0.7">Обращений нет</p>';
        return;
      }
      el.innerHTML = tickets.map((t) =>
        '<button type="button" class="ticket" data-id="' + escapeHtml(t.id) + '">' +
        '<div class="sub">' + escapeHtml(t.subject) + '</div>' +
        '<div class="meta">' + escapeHtml(STATUS[t.status] || t.status) + ' · ' +
        escapeHtml((t.last_preview || '').slice(0, 60)) + '</div></button>'
      ).join('');
      el.querySelectorAll('.ticket').forEach((btn) => {
        btn.onclick = () => vscode.postMessage({ type: 'supportGet', id: btn.dataset.id });
      });
    }

    function escapeHtml(s) {
      return String(s ?? '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
    }

    function safeImageSrc(value) {
      const src = String(value || '');
      return /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(src) ? src : '';
    }

    function renderThread(detail) {
      currentId = detail.id;
      document.getElementById('threadHead').innerHTML =
        '<strong>' + escapeHtml(detail.subject) + '</strong><br><span style="font-size:11px;opacity:0.8">' +
        escapeHtml(STATUS[detail.status] || detail.status) + '</span>';
      const closed = detail.status === 'closed';
      document.getElementById('replyBox').classList.toggle('hidden', closed);
      document.getElementById('thread').innerHTML = (detail.messages || []).map((m) => {
        let att = '';
        (m.attachments || []).forEach((a) => {
          const imageSrc = safeImageSrc(a.preview_url);
          if (imageSrc) att += '<img src="' + imageSrc + '" alt="" />';
          else if (a.text_preview) att += '<pre style="font-size:10px">' + escapeHtml(a.text_preview) + '</pre>';
        });
        return '<div class="msg ' + (m.author === 'admin' ? 'admin' : 'user') + '">' +
          '<div class="who">' + (m.author === 'admin' ? 'Поддержка' : 'Вы') + '</div>' +
          escapeHtml(m.body) + att + '</div>';
      }).join('');
      setView('thread');
      const box = document.getElementById('thread');
      box.scrollTop = box.scrollHeight;
    }

    document.getElementById('tabList').onclick = () => {
      setView('list');
      vscode.postMessage({ type: 'supportList' });
    };
    document.getElementById('tabNew').onclick = () => setView('new');
    document.getElementById('backList').onclick = () => {
      setView('list');
      vscode.postMessage({ type: 'supportList' });
    };

    document.getElementById('sendNew').onclick = () => {
      const subject = document.getElementById('subject').value.trim();
      const body = document.getElementById('body').value.trim();
      if (!subject || !body) { showErr('Тема и текст обязательны'); return; }
      showErr('');
      vscode.postMessage({
        type: 'supportCreate',
        category: document.getElementById('category').value,
        subject,
        body,
        attachments: newAtt,
      });
    };

    document.getElementById('sendReply').onclick = () => {
      const body = document.getElementById('replyBody').value.trim();
      if (!currentId) return;
      if (!body && !replyAtt.length) { showErr('Введите текст'); return; }
      showErr('');
      vscode.postMessage({
        type: 'supportMessage',
        id: currentId,
        body: body || '—',
        attachments: replyAtt,
      });
    };

    window.addEventListener('message', (ev) => {
      const msg = ev.data;
      if (msg.type === 'supportTickets') {
        tickets = msg.tickets || [];
        renderList();
        showErr('');
      }
      if (msg.type === 'supportDetail') {
        renderThread(msg.detail);
        document.getElementById('replyBody').value = '';
        replyAtt = [];
        renderReplyAttachments();
        showErr('');
      }
      if (msg.type === 'supportCreated') {
        newAtt = [];
        document.getElementById('subject').value = '';
        document.getElementById('body').value = '';
        renderNewAttachments();
        renderThread(msg.detail);
      }
      if (msg.type === 'supportError') showErr(msg.text);
      if (msg.type === 'supportLoading') {
        document.getElementById('sendNew').disabled = msg.loading;
        document.getElementById('sendReply').disabled = msg.loading;
      }
    });

    vscode.postMessage({ type: 'supportList' });
  </script>
</body>
</html>`;
}

module.exports = { getSupportPanelHtml };
