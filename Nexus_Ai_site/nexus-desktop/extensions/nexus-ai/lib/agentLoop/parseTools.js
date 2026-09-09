/**
 * Parse tool invocations from model text.
 * Formats: ```nexus-tool json\n{...}\n``` or ```json\n{"tool":...}\n```
 */

/**
 * @returns {{ tool: string, args: Record<string, unknown> }[]}
 */
function parseToolCalls(text) {
  const calls = [];
  if (!text) return calls;

  const fenceRe = /```(?:nexus-tool|json)\s*\n([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    pushParsed(calls, m[1]);
  }

  const inlineRe = /\{"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
  while ((m = inlineRe.exec(text)) !== null) {
    try {
      calls.push({ tool: m[1], args: JSON.parse(m[2]) });
    } catch {
      /* skip */
    }
  }

  return calls;
}

/**
 * @param {{ tool: string, args: Record<string, unknown> }[]} out
 * @param {string} raw
 */
function pushParsed(out, raw) {
  const trimmed = raw.trim();
  if (!trimmed) return;
  try {
    const data = JSON.parse(trimmed);
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && item.tool) out.push({ tool: String(item.tool), args: item.args || {} });
      }
      return;
    }
    if (data.tool) {
      out.push({ tool: String(data.tool), args: data.args || {} });
    }
  } catch {
    /* skip invalid */
  }
}

/**
 * Strip tool blocks from text shown to user.
 */
function stripToolBlocks(text) {
  if (!text) return '';
  return text
    .replace(/```(?:nexus-tool|json)\s*\n[\s\S]*?```/gi, '')
    .replace(/\{"tool"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[\s\S]*?\}\s*\}/g, '')
    .trim();
}

module.exports = { parseToolCalls, stripToolBlocks };
