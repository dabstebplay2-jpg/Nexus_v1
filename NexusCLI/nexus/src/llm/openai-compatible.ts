import { z } from "zod"
import type { ModelEvent, ModelRequest, Provider } from "../domain/ports"
import { abort, cancellable, NexusError } from "../shared/errors"
import { bound } from "../shared/redact"

const deltaSchema = z.object({
  content: z.string().nullable().optional(),
  tool_calls: z
    .array(
      z.object({
        index: z.number().int().min(0).max(63),
        id: z.string().optional(),
        function: z.object({ name: z.string().optional(), arguments: z.string().optional() }).optional(),
      }),
    )
    .optional(),
})
const chunkSchema = z.object({
  choices: z.array(
    z.object({
      index: z.number().optional(),
      delta: deltaSchema.optional(),
      message: deltaSchema.optional(),
      finish_reason: z.string().nullable().optional(),
    }),
  ),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullable().optional(),
})

export class OpenAICompatibleProvider implements Provider {
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}
  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    const response = await this.connect(request)
    if (!response.body) throw new NexusError("PROTOCOL", "Provider returned an empty response")
    const pending = new Map<number, { id: string; name: string; arguments: string }>()
    const state = { finished: false, chars: 0 }
    const frames = request.model.capabilities.streaming ? sse(response.body) : single(response)
    for await (const raw of frames) {
      abort(request.signal)
      if (raw === "[DONE]") break
      state.chars += raw.length
      if (state.chars > 2 * 1024 * 1024) throw new NexusError("PROTOCOL", "Provider response exceeded 2 MiB")
      const chunk = chunkSchema.parse(JSON.parse(raw))
      if (chunk.usage)
        yield { type: "usage", inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens }
      const choice = chunk.choices.find((item) => (item.index ?? 0) === 0)
      if (!choice) continue
      const delta = choice.delta ?? choice.message
      if (delta?.content) yield { type: "text", text: delta.content }
      delta?.tool_calls?.forEach((call, index) => {
        const key = call.index ?? index
        const current = pending.get(key) ?? { id: "", name: "", arguments: "" }
        current.id += call.id ?? ""
        current.name += call.function?.name ?? ""
        current.arguments += call.function?.arguments ?? ""
        pending.set(key, current)
      })
      if (choice.finish_reason === "length")
        throw new NexusError("OUTPUT_LIMIT", "Model output truncated; tool calls will not execute")
      if (choice.finish_reason === "content_filter") throw new NexusError("FILTERED", "Provider declined the response")
      if (choice.finish_reason && !["stop", "tool_calls"].includes(choice.finish_reason))
        throw new NexusError("PROTOCOL", `Unsupported finish reason ${choice.finish_reason}`)
      if (choice.finish_reason) state.finished = true
    }
    if (!state.finished)
      throw new NexusError("PROTOCOL", "Provider stream ended before a finish reason; no tools executed")
    const ids = new Set<string>()
    for (const call of pending.values()) {
      if (!call.id || !call.name || ids.has(call.id))
        throw new NexusError("PROTOCOL", "Invalid or duplicate tool call ID")
      ids.add(call.id)
      yield { type: "tool", call: { id: call.id, name: call.name, arguments: JSON.parse(call.arguments || "{}") } }
    }
    yield { type: "finish" }
  }
  private async connect(request: ModelRequest): Promise<Response> {
    const url = new URL(`${request.model.baseUrl.replace(/\/$/, "")}/chat/completions`)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new NexusError("CONFIG", "Invalid provider URL")
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new NexusError("CONFIG", "Remote providers require HTTPS")
    const key = this.env[request.model.apiKeyEnv]
    for (const attempt of [0, 1, 2]) {
      abort(request.signal)
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: request.signal,
        headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model: request.model.model,
          stream: request.model.capabilities.streaming,
          max_tokens: request.maxTokens,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.toolCalls?.length
              ? {
                  tool_calls: message.toolCalls.map((call) => ({
                    id: call.id,
                    type: "function",
                    function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                  })),
                }
              : {}),
            ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
          })),
          ...(request.tools.length && request.model.capabilities.toolCalling
            ? {
                tools: request.tools.map((tool) => ({ type: "function", function: tool })),
                parallel_tool_calls: request.model.capabilities.parallelTools,
              }
            : {}),
        }),
      })
      if (response.ok) return response
      const raw = await responseText(response)
      const detail = bound(key ? raw.replaceAll(key, "[REDACTED]") : raw, 1000).text
      if (response.status === 413 || /context.{0,30}(length|window|exceed|limit)|maximum context/i.test(detail))
        throw new NexusError("CONTEXT_OVERFLOW", detail)
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt === 2) throw new NexusError(`HTTP_${response.status}`, detail, retryable)
      const retryAfter = response.headers.get("retry-after")
      const seconds = retryAfter ? Number(retryAfter) : NaN
      const delay = Number.isFinite(seconds)
        ? seconds * 1000
        : retryAfter
          ? Date.parse(retryAfter) - Date.now()
          : 250 * 2 ** attempt
      await cancellable(Bun.sleep(Math.min(10000, Math.max(0, Number.isFinite(delay) ? delay : 1000))), request.signal)
    }
    throw new NexusError("PROVIDER", "Retry budget exhausted")
  }
}

async function* sse(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder()
  const state = { buffer: "" }
  for await (const chunk of stream) {
    state.buffer += decoder.decode(chunk, { stream: true })
    if (state.buffer.length > 1024 * 1024) throw new NexusError("PROTOCOL", "Oversized SSE frame")
    while (/\r?\n\r?\n/.test(state.buffer)) {
      const delimiter = /\r?\n\r?\n/.exec(state.buffer)!
      const frame = state.buffer.slice(0, delimiter.index)
      state.buffer = state.buffer.slice(delimiter.index + delimiter[0].length)
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
      if (data) yield data
    }
  }
  if (state.buffer.trim()) throw new NexusError("PROTOCOL", "Incomplete SSE frame")
}
async function* single(response: Response) {
  const raw: unknown = JSON.parse(await responseText(response))
  // Non-streaming tool calls have no index; normalize only this wire difference.
  const schema = z.object({
    choices: z.array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(z.object({ id: z.string(), function: z.object({ name: z.string(), arguments: z.string() }) }))
            .optional(),
        }),
        finish_reason: z.string(),
      }),
    ),
    usage: z.unknown().optional(),
  })
  const parsed = schema.parse(raw)
  yield JSON.stringify({
    ...parsed,
    choices: parsed.choices.map((choice) => ({
      ...choice,
      message: { ...choice.message, tool_calls: choice.message.tool_calls?.map((call, index) => ({ ...call, index })) },
    })),
  })
}
async function responseText(response: Response) {
  if (!response.body) return ""
  const decoder = new TextDecoder()
  const parts: string[] = []
  const state = { bytes: 0 }
  for await (const chunk of response.body) {
    state.bytes += chunk.length
    if (state.bytes > 2 * 1024 * 1024) throw new NexusError("PROTOCOL", "Provider response exceeded 2 MiB")
    parts.push(decoder.decode(chunk, { stream: true }))
  }
  return parts.join("") + decoder.decode()
}
