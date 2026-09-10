import type { TokenCounter } from "../domain/ports"
import type { Message } from "../domain/types"
import type { ToolSpec } from "../domain/ports"

/**
 * Provider-independent token accounting.
 *
 * Nexus budgets context in tokens because that is the unit models actually charge. Measuring
 * bytes against a token window is not a rounding error: it made small local models unusable,
 * because ~6.8 KB of instructions and tool schemas is only ~2k tokens but looks like 6.8k
 * "tokens" when counted as bytes.
 *
 * The default is a heuristic, not a tokenizer. It deliberately does not depend on tiktoken or
 * any vendor: a provider that knows its own tokenizer can supply a better TokenCounter, and
 * everything above this interface stays unchanged.
 */
export class HeuristicTokenCounter implements TokenCounter {
  /** Code and JSON are denser than prose, so the Latin divisor stays conservative. */
  constructor(private readonly charactersPerToken = 3.5) {}
  count(text: string) {
    let narrow = 0
    let wide = 0
    let dense = 0
    for (const character of text) {
      const code = character.codePointAt(0) ?? 0
      if (code > 0x2e7f) dense++
      else if (code > 0x02af) wide++
      else narrow++
    }
    // Latin ~3.5 chars/token, Cyrillic/Greek/Hebrew/Arabic ~2, CJK and emoji ~1 token per character.
    return Math.ceil(narrow / this.charactersPerToken + wide / 2 + dense)
  }
}

/** Chat APIs bill a small per-message envelope for role and delimiters on top of the content. */
export const messageEnvelopeTokens = 4

export function countMessages(counter: TokenCounter, messages: Message[]) {
  return messages.reduce(
    (total, message) =>
      total +
      messageEnvelopeTokens +
      counter.count(JSON.stringify({
        role: message.role,
        content: message.content,
        ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map(call => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) } : {}),
        ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
      })),
    0,
  )
}

export function countTools(counter: TokenCounter, tools: ToolSpec[]) {
  return tools.length ? counter.count(JSON.stringify(tools.map(tool => ({ type: "function", function: tool })))) + 16 : 0
}
