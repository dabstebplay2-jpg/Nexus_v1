const MAX_EXCERPT = 32_000;

const EXTRACT_SCRIPT = `
(function() {
  const sel = window.getSelection ? String(window.getSelection()) : '';
  const text = (document.body && document.body.innerText) ? document.body.innerText : '';
  return {
    url: location.href,
    title: document.title || '',
    excerpt: text.slice(0, ${MAX_EXCERPT}),
    selection: sel ? sel.slice(0, 8000) : ''
  };
})()
`;

async function extractPageContext(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return { url: '', title: '', excerpt: '', selection: '' };
  }
  try {
    const result = await webContents.executeJavaScript(EXTRACT_SCRIPT, true);
    return {
      url: result?.url || webContents.getURL() || '',
      title: result?.title || webContents.getTitle() || '',
      excerpt: result?.excerpt || '',
      selection: result?.selection || '',
    };
  } catch {
    return {
      url: webContents.getURL() || '',
      title: webContents.getTitle() || '',
      excerpt: '',
      selection: '',
    };
  }
}

module.exports = { extractPageContext, MAX_EXCERPT };
