const { extractPageContext } = require('./pageContext');

const CLICK_SCRIPT = (selector) => `
(function() {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return 'not found: ${selector.replace(/'/g, '')}';
  el.click();
  return 'clicked';
})()
`;

const TYPE_SCRIPT = (selector, text) => `
(function() {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return 'not found';
  el.focus();
  el.value = ${JSON.stringify(text)};
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()
`;

const SCROLL_SCRIPT = (deltaY) => `
(function() {
  window.scrollBy(0, ${Number(deltaY) || 400});
  return 'scrolled';
})()
`;

async function runBrowserTool(tabManager, tool, args, { autoConfirm }) {
  const wc = tabManager.getActiveWebContents();
  if (!wc) return 'Нет активной вкладки';

  const url = wc.getURL();
  if (!tabManager.isAgentUrlAllowed(url) && tool !== 'browser_navigate') {
    return 'Действие заблокировано на этом сайте (банк/chrome)';
  }

  switch (tool) {
    case 'browser_navigate': {
      const target = args?.url;
      if (!target) return 'url обязателен';
      if (!tabManager.isAgentUrlAllowed(target) && !/^https?:\/\//i.test(target)) {
        return 'URL заблокирован';
      }
      const id = tabManager.activeId;
      const nav = tabManager.navigate(id, target);
      if (nav?.searchQuery) return `Это поисковый запрос, не URL: ${nav.searchQuery}`;
      return `navigated to ${target}`;
    }
    case 'browser_click': {
      if (!autoConfirm) return 'pending_confirm:click';
      return wc.executeJavaScript(CLICK_SCRIPT(args?.selector || ''), true);
    }
    case 'browser_type': {
      if (!autoConfirm) return 'pending_confirm:type';
      return wc.executeJavaScript(
        TYPE_SCRIPT(args?.selector || '', args?.text || ''),
        true
      );
    }
    case 'browser_scroll': {
      return wc.executeJavaScript(SCROLL_SCRIPT(args?.deltaY), true);
    }
    case 'browser_snapshot': {
      const ctx = await extractPageContext(wc);
      return JSON.stringify(ctx).slice(0, 12000);
    }
    case 'browser_tabs_list': {
      return JSON.stringify(tabManager.listTabs());
    }
    default:
      return `unknown tool: ${tool}`;
  }
}

function parseBrowserTools(text) {
  const tools = [];
  const re = /```nexus-browser-tool\s*([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text))) {
    const block = m[1].trim();
    try {
      const parsed = JSON.parse(block);
      if (Array.isArray(parsed)) tools.push(...parsed);
      else tools.push(parsed);
    } catch {
      /* skip */
    }
  }
  return tools.filter((t) => t && t.tool);
}

module.exports = { runBrowserTool, parseBrowserTools };
