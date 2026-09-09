/** Models that reliably support OpenAI-style tool calling (connectors in chat). */
const TOOL_CALLING_PATTERNS = [
  /customtools/i,
  /\bgpt-4/i,
  /\bgpt-5/i,
  /\bo3\b/i,
  /\bclaude-/i,
  /gemini-.*-pro/i,
  /gemini-3/i,
  /\bgrok-/i,
  /deepseek.*chat/i,
];

export function modelSupportsToolCalling(model) {
  if (!model) return false;
  const id = String(model.id || model.model || model.name || '');
  if (!id) return false;
  return TOOL_CALLING_PATTERNS.some((re) => re.test(id));
}
