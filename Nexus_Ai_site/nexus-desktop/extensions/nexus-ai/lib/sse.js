/**
 * Consume Nexus SSE stream (data: {...}\n\n) from extension host.
 * sync with frontend/src/lib/apiStream.js
 */
async function consumeSseResponse(res, handlers = {}) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = typeof err.detail === 'string' ? err.detail : `Ошибка ${res.status}`;
    handlers.onError?.(detail);
    throw new Error(detail);
  }
  if (!res.body) {
    throw new Error('Поток ответа недоступен');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const stats = { events: 0, tokens: 0, thinking: 0, done: false, parseErrors: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const block of parts) {
      const line = block.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        stats.parseErrors += 1;
        continue;
      }
      stats.events += 1;
      if (data.type === 'thinking' && data.content) {
        stats.thinking += 1;
        handlers.onThinking?.(data.content, data);
      } else if (data.type === 'token' && data.content) {
        stats.tokens += 1;
        handlers.onToken?.(data.content);
      } else if (data.type === 'image' && data.url) {
        handlers.onImage?.({ url: data.url, dataUrl: data.dataUrl });
      } else if (data.type === 'done') {
        stats.done = true;
        handlers.onDone?.(data);
      } else if (data.type === 'status' && data.content) {
        handlers.onStatus?.(data.content);
      } else if (data.type === 'search_round') {
        handlers.onSearchRound?.(data);
      } else if (data.type === 'search_plan') {
        handlers.onSearchPlan?.(data);
      } else if (data.type === 'pre_search_done') {
        handlers.onPreSearchDone?.(data);
      } else if (data.type === 'error') {
        const msg = data.detail || 'Ошибка потока';
        handlers.onError?.(msg);
        throw new Error(msg);
      }
    }
  }
  return stats;
}

module.exports = { consumeSseResponse };
