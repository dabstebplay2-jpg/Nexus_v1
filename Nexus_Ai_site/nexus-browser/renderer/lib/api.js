const api = window.nexusBrowser?.api;

export async function fetchModels() {
  const res = await api.fetch('/ai/models');
  if (!res.ok) throw new Error(res.json?.detail || `HTTP ${res.status}`);
  return res.json;
}

export async function omniboxSearch(query) {
  const res = await api.fetch('/ai/browser/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, depth: 'quick' }),
  });
  if (!res.ok) throw new Error(res.json?.detail || `HTTP ${res.status}`);
  return res.json;
}

export function streamContextChat(body, handlers) {
  return api.stream('/ai/browser/context-chat/stream', body, handlers);
}

export function streamAgentChat(body, handlers) {
  return api.stream('/ai/browser/agent/stream', body, handlers);
}

export function parseBrowserTools(text) {
  const tools = [];
  const re = /```nexus-browser-tool\s*([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) tools.push(...parsed);
      else tools.push(parsed);
    } catch {
      /* skip */
    }
  }
  return tools.filter((t) => t?.tool);
}
