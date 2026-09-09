/**
 * Lightweight markdown for webview (no deps). Used via panel.js in browser.
 */
(function (global) {
  function escapeHtml(t) {
    return String(t || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inlineFormat(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return s;
  }

  function parseFenceLine(firstLine) {
    const m = firstLine.match(/^([\w+#.-]*)(?:\s+(.+))?$/);
    if (!m) return { lang: 'plaintext', filename: '' };
    const lang = m[1] || 'plaintext';
    const rest = (m[2] || '').trim();
    if (/^[\w./\\-]+\.\w+$/.test(rest)) return { lang, filename: rest };
    return { lang, filename: '' };
  }

  /**
   * @returns {{ html: string, blocks: { lang: string, filename: string, content: string }[] }}
   */
  function renderMarkdown(text) {
    const blocks = [];
    if (!text) return { html: '', blocks };

    const parts = text.split(/(```[\s\S]*?```)/g);
    let html = '';

    for (const part of parts) {
      if (part.startsWith('```') && part.endsWith('```')) {
        const inner = part.slice(3, -3);
        const nl = inner.indexOf('\n');
        const firstLine = nl >= 0 ? inner.slice(0, nl).trim() : inner.trim();
        const body = nl >= 0 ? inner.slice(nl + 1) : '';
        const { lang, filename } = parseFenceLine(firstLine);
        const content = body.replace(/\n$/, '');
        const idx = blocks.length;
        blocks.push({ lang, filename, content });

        const fn = filename ? `<span class="code-fn">${escapeHtml(filename)}</span>` : '';
        html += `<div class="code-block" data-block-idx="${idx}">
          <div class="code-head">
            ${fn}<span class="code-lang">${escapeHtml(lang || 'code')}</span>
            <button type="button" class="code-copy" data-copy-block="${idx}" title="Копировать">Копировать</button>
            <button type="button" class="code-apply" data-apply-block="${idx}" title="Применить в workspace">Применить</button>
          </div>
          <pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(content)}</code></pre>
        </div>`;
        continue;
      }

      const lines = part.split('\n');
      let inUl = false;
      let inOl = false;
      let para = [];

      function flushPara() {
        if (!para.length) return;
        html += `<p>${inlineFormat(para.join('\n'))}</p>`;
        para = [];
      }

      function closeLists() {
        if (inUl) {
          html += '</ul>';
          inUl = false;
        }
        if (inOl) {
          html += '</ol>';
          inOl = false;
        }
      }

      for (const line of lines) {
        const h = line.match(/^(#{1,3})\s+(.+)$/);
        if (h) {
          flushPara();
          closeLists();
          const level = h[1].length;
          html += `<h${level}>${inlineFormat(h[2])}</h${level}>`;
          continue;
        }
        const ul = line.match(/^[-*]\s+(.+)$/);
        if (ul) {
          flushPara();
          if (inOl) {
            html += '</ol>';
            inOl = false;
          }
          if (!inUl) {
            html += '<ul>';
            inUl = true;
          }
          html += `<li>${inlineFormat(ul[1])}</li>`;
          continue;
        }
        const ol = line.match(/^\d+\.\s+(.+)$/);
        if (ol) {
          flushPara();
          if (inUl) {
            html += '</ul>';
            inUl = false;
          }
          if (!inOl) {
            html += '<ol>';
            inOl = true;
          }
          html += `<li>${inlineFormat(ol[1])}</li>`;
          continue;
        }
        if (!line.trim()) {
          flushPara();
          closeLists();
          continue;
        }
        closeLists();
        para.push(line);
      }
      flushPara();
      closeLists();
    }

    return { html, blocks };
  }

  global.NxMarkdown = { renderMarkdown, escapeHtml, inlineFormat };
})(typeof window !== 'undefined' ? window : globalThis);
