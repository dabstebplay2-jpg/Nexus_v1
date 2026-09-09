/* global NxMarkdown, acquireVsCodeApi */
(function () {
  const vscode = acquireVsCodeApi();
  const persisted = vscode.getState() || {};

  const messagesEl = document.getElementById('messages');
  const messagesWrap = document.getElementById('messagesWrap');
  const input = document.getElementById('input');
  const modelSel = document.getElementById('model');
  const attachStrip = document.getElementById('attachStrip');
  const applyBar = document.getElementById('applyBar');
  const fileInput = document.getElementById('fileInput');
  const streamStatusEl = document.getElementById('streamStatus');
  const scrollFab = document.getElementById('scrollFab');
  const emptyState = document.getElementById('emptyState');

  let attachments = persisted.attachments || [];
  let streamingEl = null;
  let streamingBody = null;
  let thinkSlot = null;
  let thinkPanel = null;
  let toolTimeline = null;
  let answerStarted = false;
  let agentMode = persisted.agentMode !== false;
  if (persisted.agentMode === undefined) agentMode = true;
  let pendingExtra = '';
  let allModels = [];
  let thinkingPrefs = persisted.thinkingPrefs || {};
  let currentFamilyId = '';
  let agents = [];
  let agentCatalog = [];
  let useWebSearch = persisted.useWebSearch === true;
  let webSearchDepth = persisted.webSearchDepth || 'standard';
  let selectedAgentId = persisted.agentId || '';
  let streamState = null;
  let lastBlocks = [];
  let streamStatusText = '';
  let userScrolledUp = false;

  const MAX_ATT = 8;
  const LS_WEB = 'nexus-web-search';
  const LS_DEPTH = 'nexus-web-search-depth';

  try {
    if (localStorage.getItem(LS_WEB) === 'true') useWebSearch = true;
    const d = localStorage.getItem(LS_DEPTH);
    if (d) webSearchDepth = d;
  } catch (_) {}

  function saveState() {
    vscode.setState({
      modelId: modelSel.value,
      attachments,
      thinkingPrefs,
      useWebSearch,
      webSearchDepth,
      agentId: document.getElementById('agent')?.value || selectedAgentId,
      agentMode,
    });
  }

  function syncAgentModeUi() {
    const btn = document.getElementById('btnAgentMode');
    const pill = document.getElementById('modePill');
    if (!btn) return;
    btn.classList.toggle('on', agentMode);
    btn.textContent = agentMode ? '⚡ Агент' : '💬 Чат';
    if (pill) {
      pill.textContent = agentMode ? 'Режим агента' : 'Чат';
      pill.classList.toggle('agent', agentMode);
    }
  }

  function findCatalogModel() {
    if (!currentFamilyId) {
      return allModels.find((m) => (m.model_id_standard || m.id) === modelSel.value) || null;
    }
    return allModels.find((m) => m.family_id === currentFamilyId) || null;
  }

  function isThinkingOn() {
    return currentFamilyId && thinkingPrefs[currentFamilyId];
  }

  function resolvedModelId() {
    const m = findCatalogModel();
    if (!m) return modelSel.value;
    const std = m.model_id_standard || m.id;
    const separate =
      m.supports_thinking &&
      m.model_id_thinking &&
      m.model_id_thinking !== std &&
      !m.thinking_via_reasoning_api;
    if (isThinkingOn() && separate) return m.model_id_thinking;
    return std;
  }

  function syncThinkingBtn() {
    const m = findCatalogModel();
    const btn = document.getElementById('btnThinking');
    if (!m || !m.supports_thinking) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = 'inline-flex';
    const on = isThinkingOn();
    btn.classList.toggle('on', on);
    btn.textContent = on
      ? '🧠 ' + (m.thinking_hint || 'Мышление вкл.')
      : '🧠 Режим мышления';
  }

  function syncGlobe() {
    const btn = document.getElementById('btnGlobe');
    const depth = document.getElementById('searchDepth');
    btn.classList.toggle('on', useWebSearch);
    btn.classList.toggle('globe-on', useWebSearch);
    depth.disabled = !useWebSearch;
    depth.value = webSearchDepth;
  }

  function updateEmptyState() {
    const hasMsgs = messagesEl.querySelectorAll('.msg-row, .bubble.err').length > 0;
    emptyState.style.display = hasMsgs ? 'none' : 'block';
  }

  function setStreamStatus(text) {
    streamStatusText = text || '';
    if (!text) {
      streamStatusEl.classList.remove('visible');
      streamStatusEl.innerHTML = '';
      document.body.classList.remove('agent-streaming', 'tool-running', 'thinking-stream');
      return;
    }
    streamStatusEl.classList.add('visible');
    if (/инструмент/i.test(text)) document.body.classList.add('tool-running');
    else if (/агент/i.test(text)) document.body.classList.add('agent-streaming');
    else if (/рассуждаю|поиск|планирую/i.test(text)) document.body.classList.add('thinking-stream');
    streamStatusEl.innerHTML =
      '<span class="dot-pulse"></span><span>' + NxMarkdown.escapeHtml(text) + '</span>';
  }

  function scrollToBottom(smooth) {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    userScrolledUp = false;
    scrollFab.classList.remove('visible');
  }

  messagesEl.addEventListener('scroll', () => {
    const dist = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    userScrolledUp = dist > 80;
    scrollFab.classList.toggle('visible', userScrolledUp);
  });

  scrollFab.onclick = () => scrollToBottom(true);

  function renderSearchSteps(steps, status) {
    let html = '';
    if (status) html += '<p class="search-status">' + NxMarkdown.escapeHtml(status) + '</p>';
    (steps || []).forEach((s) => {
      const label =
        s.phase === 'reason'
          ? 'Размышление перед поиском'
          : s.phase === 'analyze'
            ? 'Анализ запроса'
            : s.phase === 'merge'
              ? 'Сбор результатов'
              : 'Поиск';
      html += '<div class="search-step"><strong>' + label + '</strong>';
      if (s.intent) html += '<div>' + NxMarkdown.escapeHtml(s.intent).slice(0, 400) + '</div>';
      if (s.queries && s.queries.length) {
        html +=
          '<div class="search-queries">' +
          s.queries.map((q) => '«' + NxMarkdown.escapeHtml(q) + '»').join(' · ') +
          '</div>';
      }
      if (s.sourcesTotal != null && s.phase !== 'analyze') {
        html += '<div class="search-meta">Источников: ' + s.sourcesTotal + '</div>';
      }
      html += '</div>';
    });
    return html;
  }

  function ensureThinkPanel() {
    if (!streamingEl) startAssistant();
    if (thinkPanel) return thinkPanel;
    const parent = thinkSlot || streamingEl;
    if (!parent) return null;
    thinkPanel = document.createElement('div');
    thinkPanel.className = 'think-panel';
    thinkPanel.innerHTML =
      '<button type="button" class="think-head"><span class="chev">▼</span> Мышление и поиск</button><div class="think-body"></div>';
    thinkPanel.querySelector('.think-head').onclick = () => {
      thinkPanel.classList.toggle('collapsed');
    };
    parent.insertBefore(thinkPanel, parent.firstChild);
    return thinkPanel;
  }

  function ensureToolTimeline() {
    if (toolTimeline) return toolTimeline;
    const parent = thinkSlot || streamingEl;
    if (!parent) return null;
    toolTimeline = document.createElement('div');
    toolTimeline.className = 'tool-timeline';
    toolTimeline.innerHTML = '<div class="tool-timeline-head">Инструменты</div><div class="tool-steps"></div>';
    const anchor = thinkPanel ? thinkPanel.nextSibling : parent.firstChild;
    if (anchor) parent.insertBefore(toolTimeline, anchor);
    else parent.appendChild(toolTimeline);
    return toolTimeline;
  }

  function upsertToolStep(step) {
    const tl = ensureToolTimeline();
    if (!tl) return;
    const wrap = tl.querySelector('.tool-steps');
    let el = wrap.querySelector('[data-step-id="' + step.id + '"]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'tool-step';
      el.dataset.stepId = step.id;
      wrap.appendChild(el);
    }
    const status = step.status || 'running';
    el.className = 'tool-step ' + status;
    const argsStr = step.args ? JSON.stringify(step.args).slice(0, 120) : '';
    el.innerHTML =
      '<strong>' +
      NxMarkdown.escapeHtml(step.name) +
      '</strong><span class="tool-status">' +
      (status === 'running' ? 'выполняется…' : status === 'error' ? 'ошибка' : 'готово') +
      '</span>' +
      (argsStr ? '<div class="tool-args">' + NxMarkdown.escapeHtml(argsStr) + '</div>' : '') +
      (step.outputPreview
        ? '<pre class="tool-out">' + NxMarkdown.escapeHtml(step.outputPreview.slice(0, 800)) + '</pre>'
        : '');
    if (!userScrolledUp) scrollToBottom(false);
  }

  function updateThinkPanel() {
    if (!streamState) return;
    const panel = ensureThinkPanel();
    if (!panel) return;
    panel.classList.remove('collapsed');
    const body = panel.querySelector('.think-body');
    let html = '';
    if (streamState.preSearchThinking) {
      html +=
        '<div class="think-section"><h4>Размышление перед поиском</h4><div class="think-pre">' +
        NxMarkdown.escapeHtml(streamState.preSearchThinking) +
        '</div></div>';
    }
    if (streamState.searchActivity && (streamState.searchActivity.steps || []).length) {
      html +=
        '<div class="think-section"><h4>Поиск</h4>' +
        renderSearchSteps(
          streamState.searchActivity.steps,
          streamState.searchActivity.status
        ) +
        '</div>';
    }
    if (streamState.thinking) {
      html +=
        '<div class="think-section"><h4>Рассуждение при ответе</h4><div class="think-answer">' +
        NxMarkdown.escapeHtml(streamState.thinking) +
        '</div></div>';
    }
    body.innerHTML = html || '<span style="opacity:0.6">Ожидание…</span>';
    if (!userScrolledUp) scrollToBottom(false);
  }

  function renderSources(parent, sources) {
    if (!sources || !sources.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'sources-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sources-btn';
    btn.textContent = '🔗 Источники (' + sources.length + ')';
    const list = document.createElement('div');
    list.className = 'sources-list';
    sources.forEach((s, i) => {
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = (i + 1) + '. ' + (s.title || s.url);
      list.appendChild(a);
    });
    btn.onclick = () => list.classList.toggle('open');
    wrap.appendChild(btn);
    wrap.appendChild(list);
    parent.appendChild(wrap);
  }

  function bindCodeActions(container) {
    container.querySelectorAll('[data-copy-block]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.copyBlock);
        const block = lastBlocks[idx];
        if (block) vscode.postMessage({ type: 'copyText', text: block.content });
      };
    });
    container.querySelectorAll('[data-apply-block]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.applyBlock);
        const block = lastBlocks[idx];
        if (block) {
          vscode.postMessage({
            type: 'applyBlock',
            filename: block.filename,
            content: block.content,
            language: block.lang,
          });
        }
      };
    });
  }

  function renderAssistantContent(el, text) {
    const { html, blocks } = NxMarkdown.renderMarkdown(text);
    lastBlocks = blocks;
    const body = el.querySelector('.md-body') || el.querySelector('.body');
    if (!body) return;
    body.innerHTML = html || '<p></p>';
    bindCodeActions(body);
  }

  function setCtx(text) {
    document.getElementById('ctx').textContent = text || 'Контекст: —';
    document.getElementById('ctx').title = text || '';
  }

  function renderAttachStrip() {
    attachStrip.innerHTML = '';
    attachments.forEach((a, i) => {
      const el = document.createElement('div');
      el.className = 'attach-item';
      if (a.kind === 'image' && a.previewUrl) {
        const img = document.createElement('img');
        img.src = a.previewUrl;
        el.appendChild(img);
      } else {
        const chip = document.createElement('span');
        chip.className = 'att-chip';
        chip.textContent = '📄 ' + (a.name || 'file').slice(0, 18);
        el.appendChild(chip);
      }
      const rm = document.createElement('button');
      rm.className = 'remove';
      rm.type = 'button';
      rm.textContent = '×';
      rm.onclick = () => {
        attachments.splice(i, 1);
        renderAttachStrip();
        saveState();
      };
      el.appendChild(rm);
      attachStrip.appendChild(el);
    });
    saveState();
  }

  function setBrandAvatar(el, variant) {
    if (!window.__nxBrand || !window.__nxBrand[variant]) {
      el.textContent = variant === 'user' ? '👤' : '✦';
      return;
    }
    const img = document.createElement('img');
    img.src = window.__nxBrand[variant];
    img.alt = variant === 'user' ? 'Вы' : 'Nexus';
    img.className = 'avatar-img';
    el.appendChild(img);
  }

  function createMessageRow(role, label) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + role;
    const av = document.createElement('div');
    av.className = 'msg-avatar';
    setBrandAvatar(av, role === 'user' ? 'user' : 'assistant');
    const col = document.createElement('div');
    col.className = 'msg-col';
    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + role;
    const roleEl = document.createElement('div');
    roleEl.className = 'role';
    roleEl.textContent = label || (role === 'user' ? 'Вы' : 'Nexus');
    bubble.appendChild(roleEl);
    col.appendChild(bubble);
    row.appendChild(av);
    row.appendChild(col);
    messagesEl.appendChild(row);
    updateEmptyState();
    return { row, bubble, col };
  }

  function addMessageActions(col, text, role) {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Копировать';
    copyBtn.onclick = () => vscode.postMessage({ type: 'copyText', text });
    actions.appendChild(copyBtn);
    if (role === 'assistant') {
      const regen = document.createElement('button');
      regen.type = 'button';
      regen.textContent = 'Повторить';
      regen.onclick = () => vscode.postMessage({ type: 'regenerate' });
      actions.appendChild(regen);
    }
    col.appendChild(actions);
  }

  function appendUserMessage(text, att) {
    const { bubble, col } = createMessageRow('user', 'Вы');
    const body = document.createElement('div');
    body.className = 'md-body';
    body.textContent = text || '(вложения)';
    bubble.appendChild(body);
    if (att && att.length) {
      const wrap = document.createElement('div');
      wrap.className = 'att-preview';
      att.forEach((a) => {
        if (a.kind === 'image' && a.previewUrl) {
          const img = document.createElement('img');
          img.src = a.previewUrl;
          wrap.appendChild(img);
        } else {
          const s = document.createElement('span');
          s.className = 'att-chip';
          s.textContent = a.name;
          wrap.appendChild(s);
        }
      });
      bubble.appendChild(wrap);
    }
    addMessageActions(col, text, 'user');
    scrollToBottom(true);
  }

  function appendError(text) {
    const d = document.createElement('div');
    d.className = 'bubble err';
    d.textContent = text;
    messagesEl.appendChild(d);
    updateEmptyState();
    scrollToBottom(true);
  }

  function startAssistant(label) {
    const { bubble, col } = createMessageRow('assistant', label || 'Nexus');
    streamingEl = bubble;
    answerStarted = false;
    thinkPanel = null;
    toolTimeline = null;
    thinkSlot = document.createElement('div');
    thinkSlot.className = 'think-slot';
    const body = document.createElement('div');
    body.className = 'body md-body answer-pending';
    body.innerHTML = '<div class="answer-skeleton">Формирую ответ…</div>';
    thinkSlot.appendChild(body);
    bubble.appendChild(thinkSlot);
    streamingBody = body;
    streamState = {
      preSearchThinking: '',
      thinking: '',
      searchActivity: useWebSearch
        ? { steps: [], status: null, depth: webSearchDepth }
        : null,
    };
    setStreamStatus(useWebSearch ? 'Думаю…' : agentMode ? 'Агент…' : 'Генерирую ответ…');
    scrollToBottom(true);
  }

  function revealAnswerBody() {
    if (!streamingBody || answerStarted) return;
    answerStarted = true;
    streamingBody.classList.remove('answer-pending');
    streamingBody.innerHTML = '<span class="cursor"></span>';
    if (thinkPanel && !streamState?.thinking && !streamState?.preSearchThinking) {
      thinkPanel.classList.add('collapsed');
    }
  }

  let renderScheduled = false;
  let pendingStreamText = '';

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      if (!streamingBody) return;
      const text = pendingStreamText;
      try {
        const { html, blocks } = NxMarkdown.renderMarkdown(text);
        lastBlocks = blocks;
        streamingBody.innerHTML = html + '<span class="cursor"></span>';
        bindCodeActions(streamingBody);
      } catch (err) {
        streamingBody.textContent = text;
      }
      if (!userScrolledUp) scrollToBottom(false);
    });
  }

  function appendToken(t) {
    if (!streamingEl) startAssistant();
    revealAnswerBody();
    pendingStreamText += t;
    scheduleRender();
    setStreamStatus('Печатаю…');
  }

  function renderAgentPrompts() {
    const wrap = document.getElementById('agentPrompts');
    if (!wrap) return;
    wrap.innerHTML = '';
    const sel = document.getElementById('agent').value;
    const ag = agentCatalog.find((a) => a.id === sel);
    if (!ag || !ag.suggestedPrompts || !ag.suggestedPrompts.length) return;
    ag.suggestedPrompts.slice(0, 6).forEach((prompt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'prompt-chip';
      b.textContent = prompt;
      b.onclick = () => {
        input.value = prompt;
        autoResizeInput();
        input.focus();
      };
      wrap.appendChild(b);
    });
  }

  function endStream(hasBlocks, sources) {
    const sendBtn = document.getElementById('send');
    const stopBtn = document.getElementById('stop');
    if (sendBtn) sendBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    setStreamStatus('');
    if (thinkPanel) thinkPanel.classList.add('collapsed');
    if (streamingBody) {
      revealAnswerBody();
      const cur = streamingBody.querySelector('.cursor');
      if (cur) cur.remove();
      const sk = streamingBody.querySelector('.answer-skeleton');
      if (sk) sk.remove();
      renderAssistantContent(streamingEl, pendingStreamText);
      if (sources && sources.length) renderSources(streamingEl, sources);
      const col = streamingEl.closest('.msg-col');
      if (col) addMessageActions(col, pendingStreamText, 'assistant');
    }
    streamingEl = null;
    streamingBody = null;
    pendingStreamText = '';
    streamState = null;
    thinkPanel = null;
    thinkSlot = null;
    toolTimeline = null;
    answerStarted = false;
    applyBar.classList.toggle('visible', !!hasBlocks);
    scrollToBottom(true);
    document.body.classList.remove('agent-streaming', 'tool-running', 'thinking-stream');
  }

  function showError(text) {
    appendError(text);
    endStream(false);
  }

  function clearMessages() {
    messagesEl.innerHTML = '';
    streamStatusEl.classList.remove('visible');
    updateEmptyState();
  }

  function removeLastTurn() {
    const rows = Array.from(messagesEl.querySelectorAll('.msg-row.assistant'));
    const last = rows[rows.length - 1];
    if (last) last.remove();
    messagesEl.querySelectorAll('.think-panel, .tool-timeline').forEach((el) => el.remove());
    updateEmptyState();
  }

  function autoResizeInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(160, Math.max(48, input.scrollHeight)) + 'px';
  }

  async function resizeImageDataUrl(dataUrl, maxDim) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim) {
          resolve(dataUrl);
          return;
        }
        const scale = maxDim / Math.max(width, height);
        const c = document.createElement('canvas');
        c.width = Math.round(width * scale);
        c.height = Math.round(height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => reject(new Error('bad image'));
      img.src = dataUrl;
    });
  }

  async function processFile(file) {
    const id = 'att-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const mime = (file.type || '').toLowerCase();
    if (mime.startsWith('image/')) {
      let dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('read fail'));
        r.readAsDataURL(file);
      });
      dataUrl = await resizeImageDataUrl(dataUrl, 2048);
      const base64 = dataUrl.split(',')[1];
      return {
        id,
        kind: 'image',
        name: file.name,
        mime: 'image/jpeg',
        previewUrl: dataUrl,
        dataBase64: base64,
      };
    }
    const textEx = /\.(txt|md|json|csv|log|xml|yaml|yml|html|css|js|ts|tsx|jsx|py)$/i;
    if (mime.startsWith('text/') || textEx.test(file.name)) {
      let text = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result || ''));
        r.onerror = () => rej(new Error('read fail'));
        r.readAsText(file);
      });
      if (text.length > 32000) text = text.slice(0, 32000) + '\n… (обрезано)';
      return { id, kind: 'file', name: file.name, mime, text };
    }
    throw new Error('Формат не поддерживается: ' + file.name);
  }

  function sendChat() {
    const t = input.value.trim();
    const extra = pendingExtra;
    if (!t && !attachments.length && !extra) return;
    const sentAtt = attachments.slice();
    appendUserMessage(t || extra || '', sentAtt);
    input.value = '';
    autoResizeInput();
    attachments = [];
    renderAttachStrip();
    pendingExtra = '';
    input.placeholder = 'Сообщение… Ctrl+Enter — отправить';
    document.getElementById('send').disabled = true;
    document.getElementById('stop').disabled = false;
    applyBar.classList.remove('visible');
    const m = findCatalogModel();
    if (m) currentFamilyId = m.family_id;
    const agentVal = document.getElementById('agent').value;
    selectedAgentId = agentVal;
    vscode.postMessage({
      type: 'chat',
      text: t,
      extra,
      model: resolvedModelId(),
      familyId: currentFamilyId,
      attachments: sentAtt,
      useWebSearch,
      webSearchDepth,
      thinkingEnabled: isThinkingOn(),
      agentId: agentVal || undefined,
      agentMode,
    });
    saveState();
  }

  fileInput.onchange = async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    for (const f of files) {
      if (attachments.length >= MAX_ATT) {
        showError('Не более ' + MAX_ATT + ' вложений');
        break;
      }
      try {
        attachments.push(await processFile(f));
      } catch (e) {
        showError(e.message);
      }
    }
    renderAttachStrip();
  };

  document.getElementById('btnAttach').onclick = () => fileInput.click();
  document.getElementById('btnWorkspace').onclick = () =>
    vscode.postMessage({ type: 'pickWorkspaceFiles' });
  document.getElementById('send').onclick = sendChat;
  document.getElementById('btnGlobe').onclick = () => {
    useWebSearch = !useWebSearch;
    try {
      localStorage.setItem(LS_WEB, useWebSearch ? 'true' : 'false');
    } catch (_) {}
    syncGlobe();
    saveState();
  };
  document.getElementById('searchDepth').onchange = (e) => {
    webSearchDepth = e.target.value || 'standard';
    try {
      localStorage.setItem(LS_DEPTH, webSearchDepth);
    } catch (_) {}
    saveState();
  };
  document.getElementById('btnThinking').onclick = () => {
    const m = findCatalogModel();
    if (!m || !m.family_id) return;
    const next = !isThinkingOn();
    if (next) thinkingPrefs[m.family_id] = true;
    else delete thinkingPrefs[m.family_id];
    vscode.postMessage({ type: 'saveThinkingPref', familyId: m.family_id, enabled: next });
    syncThinkingBtn();
    saveState();
  };
  document.getElementById('btnAgentMode').onclick = () => {
    agentMode = !agentMode;
    syncAgentModeUi();
    saveState();
  };
  document.getElementById('btnClear').onclick = () => {
    if (confirm('Очистить историю чата в этой панели?')) {
      vscode.postMessage({ type: 'clearChat' });
    }
  };
  modelSel.onchange = () => {
    const opt = modelSel.selectedOptions[0];
    const fam = opt && opt.dataset.familyId;
    if (fam) currentFamilyId = fam;
    syncThinkingBtn();
    saveState();
  };
  document.getElementById('agent').onchange = () => {
    renderAgentPrompts();
    saveState();
  };
  document.getElementById('stop').onclick = () => vscode.postMessage({ type: 'abort' });
  document.getElementById('refreshModels').onclick = () => vscode.postMessage({ type: 'loadModels' });
  document.getElementById('btnCtx').onclick = () => vscode.postMessage({ type: 'refreshContext' });
  document.getElementById('btnSel').onclick = () => vscode.postMessage({ type: 'addSelection' });
  document.getElementById('btnApply').onclick = () => vscode.postMessage({ type: 'applyLast' });
  document.getElementById('btnAccount').onclick = () => vscode.postMessage({ type: 'openAccount' });
  document.getElementById('lgGoogle').onclick = () => vscode.postMessage({ type: 'loginGoogle' });
  document.getElementById('btnSupport').onclick = () => vscode.postMessage({ type: 'openSupport' });
  document.getElementById('lgEmail').onclick = () => vscode.postMessage({ type: 'loginEmail' });
  document.getElementById('lgAccount').onclick = () => vscode.postMessage({ type: 'openAccount' });

  input.addEventListener('input', autoResizeInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendChat();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    } else if (e.key === 'Escape') {
      vscode.postMessage({ type: 'abort' });
    }
  });

  function fillModels(payload) {
    allModels = payload.models || [];
    if (payload.thinkingPrefs) thinkingPrefs = payload.thinkingPrefs;
    currentFamilyId = payload.familyId || currentFamilyId;
    modelSel.innerHTML = '';
    let hasSelection = false;
    (payload.groups || []).forEach((g) => {
      const og = document.createElement('optgroup');
      og.label = g.label;
      g.models.forEach((m) => {
        const o = document.createElement('option');
        o.value = m.id;
        o.dataset.familyId = m.familyId || '';
        o.textContent = m.label;
        o.disabled = m.locked;
        if (m.id === payload.selectedId) {
          o.selected = true;
          hasSelection = true;
          currentFamilyId = m.familyId || currentFamilyId;
        }
        og.appendChild(o);
      });
      modelSel.appendChild(og);
    });
    if (!hasSelection && modelSel.options.length) modelSel.selectedIndex = 0;
    const agentSel = document.getElementById('agent');
    agentSel.innerHTML = '<option value="">Без агента</option>';
    (payload.agents || []).forEach((a) => {
      const o = document.createElement('option');
      o.value = a.id;
      o.textContent = a.name;
      if (a.id === selectedAgentId) o.selected = true;
      agentSel.appendChild(o);
    });
    agentCatalog = payload.agents || [];
    agents = agentCatalog;
    document.getElementById('tierPill').textContent = payload.tier || '—';
    const hint = document.getElementById('modelHint');
    if (payload.aiEnabled === false) {
      hint.textContent = 'ИИ недоступен на тарифе — откройте панель аккаунта.';
    } else {
      hint.textContent =
        '🔒 — выше тариф · 🧠 — reasoning на той же модели · Enter или Ctrl+Enter — отправить';
    }
    syncThinkingBtn();
    syncGlobe();
    renderAgentPrompts();
    saveState();
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    try {
    if (m.type === 'auth') {
      const gate = document.getElementById('loginGate');
      const main = document.getElementById('chatMain');
      if (m.authorized) {
        gate.classList.add('hidden');
        main.classList.remove('locked');
      } else {
        gate.classList.remove('hidden');
        main.classList.add('locked');
      }
    }
    if (m.type === 'context') setCtx(m.text);
    if (m.type === 'models') fillModels(m);
    if (m.type === 'chatCleared') clearMessages();
    if (m.type === 'removeLastTurn') removeLastTurn();
    if (m.type === 'copyDone') {
      const t = document.getElementById('toast');
      if (t) {
        t.textContent = 'Скопировано';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 1600);
      }
    }
    if (m.type === 'attachmentsAdd') {
      (m.items || []).forEach((it) => {
        if (attachments.length < MAX_ATT) attachments.push(it);
      });
      renderAttachStrip();
    }
    if (m.type === 'extra') {
      pendingExtra = m.text || '';
      input.placeholder = pendingExtra
        ? 'Контекст добавлен — задайте вопрос…'
        : 'Сообщение… Ctrl+Enter — отправить';
    }
    if (m.type === 'streamStatus') setStreamStatus(m.text);
    if (m.type === 'brand') {
      window.__nxBrand = m.uris || {};
      const iconEl = document.querySelector('.brand-icon');
      if (iconEl && m.uris.logo) {
        iconEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = m.uris.logo;
        img.alt = 'Nexus';
        img.className = 'brand-logo-img';
        iconEl.appendChild(img);
      }
      const lockup = document.getElementById('brandLockup');
      const fallbackTitle = document.querySelector('.brand-fallback-title');
      if (lockup && m.uris.logoFull) {
        lockup.src = m.uris.logoFull;
        lockup.classList.add('visible');
        if (fallbackTitle) fallbackTitle.style.display = 'none';
      } else if (fallbackTitle) {
        fallbackTitle.style.display = '';
      }
      const emptyBrand = document.getElementById('emptyBrand');
      if (emptyBrand) {
        emptyBrand.src = m.uris.wordmark || m.uris.logoFull || m.uris.logo || '';
        emptyBrand.style.display = emptyBrand.src ? 'block' : 'none';
      }
    }
    if (m.type === 'toolStep') upsertToolStep(m);
    if (m.type === 'streamStart') startAssistant(m.modelLabel || 'Nexus');
    if (m.type === 'streamSetText') {
      if (!streamingEl) startAssistant();
      pendingStreamText = m.text || '';
      if (pendingStreamText.trim()) {
        revealAnswerBody();
        scheduleRender();
      } else if (streamingBody) {
        answerStarted = false;
        streamingBody.classList.add('answer-pending');
        streamingBody.innerHTML = '<div class="answer-skeleton">Выполняю инструменты…</div>';
      }
      setStreamStatus(agentMode ? 'Инструменты…' : 'Генерирую ответ…');
    }
    if (m.type === 'token') appendToken(m.content || '');
    if (m.type === 'preSearchThinking') {
      if (!streamState)
        streamState = { searchActivity: null, thinking: '', preSearchThinking: '' };
      streamState.preSearchThinking = (streamState.preSearchThinking || '') + (m.content || '');
      updateThinkPanel();
    }
    if (m.type === 'thinking') {
      if (!streamState)
        streamState = { searchActivity: null, thinking: '', preSearchThinking: '' };
      streamState.thinking = (streamState.thinking || '') + (m.content || '');
      updateThinkPanel();
      setStreamStatus('Рассуждаю…');
    }
    if (m.type === 'searchActivity' && streamState) {
      if (m.steps) streamState.searchActivity = { steps: m.steps, status: m.status, depth: webSearchDepth };
      else if (streamState.searchActivity && m.status !== undefined) {
        streamState.searchActivity.status = m.status;
      }
      updateThinkPanel();
      if (m.status) setStreamStatus(m.status);
    }
    if (m.type === 'streamEnd') endStream(m.hasBlocks, m.sources);
    if (m.type === 'error') showError(m.text);
    if (m.type === 'applied') applyBar.classList.remove('visible');
    } catch (err) {
      // #region agent log
      vscode.postMessage({ type: 'webviewError', message: String(err && err.message ? err.message : err) });
      // #endregion
      const sendBtn = document.getElementById('send');
      const stopBtn = document.getElementById('stop');
      if (sendBtn) sendBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    }
  });

  renderAttachStrip();
  syncGlobe();
  syncAgentModeUi();
  autoResizeInput();
  updateEmptyState();
  vscode.postMessage({ type: 'checkAuth' });
  vscode.postMessage({ type: 'loadModels' });
  vscode.postMessage({ type: 'refreshContext' });
})();
