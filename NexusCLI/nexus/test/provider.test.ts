import { expect, test } from "bun:test"
import { OpenAICompatibleProvider } from "../src/llm/openai-compatible"
import type { ModelEvent, ModelRequest } from "../src/domain/ports"
import { model } from "./helpers"

function request(url: string, streaming = true): ModelRequest {
  return {
    model: { ...model, baseUrl: url, capabilities: { ...model.capabilities, streaming } },
    messages: [{ role: "user", content: "hello" }],
    tools: [],
    maxTokens: 100,
    signal: AbortSignal.timeout(3000),
  }
}
async function collect(input: ModelRequest) {
  const result: ModelEvent[] = []
  for await (const event of new OpenAICompatibleProvider().stream(input)) result.push(event)
  return result
}
function frame(delta: unknown, finish: string | null = null) {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\r\n\r\n`
}
test("actual SSE reconstructs fragmented Unicode text and tool arguments", async () => {
  const data = new TextEncoder().encode(
    frame({ content: "Привет 🌍" }) +
      frame({ tool_calls: [{ index: 0, id: "call-1", function: { name: "read", arguments: '{"pa' } }] }) +
      frame({ tool_calls: [{ index: 0, function: { arguments: 'th":"a.ts"}' } }] }, "tool_calls") +
      "data: [DONE]\r\n\r\n",
  )
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of data) controller.enqueue(Uint8Array.of(byte))
            controller.close()
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  })
  try {
    const events = await collect(request(`${server.url}v1`))
    expect(events).toContainEqual({ type: "text", text: "Привет 🌍" })
    expect(events).toContainEqual({ type: "tool", call: { id: "call-1", name: "read", arguments: { path: "a.ts" } } })
    expect(events.at(-1)?.type).toBe("finish")
  } finally {
    server.stop(true)
  }
})
test("actual non-streaming Chat Completions supports function calls", async () => {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      Response.json({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: "call-1", function: { name: "read", arguments: '{"path":"x"}' } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
  })
  try {
    expect(await collect(request(`${server.url}v1`, false))).toContainEqual({
      type: "tool",
      call: { id: "call-1", name: "read", arguments: { path: "x" } },
    })
  } finally {
    server.stop(true)
  }
})
test("truncated streaming tool calls never execute", async () => {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      new Response(frame({ tool_calls: [{ index: 0, id: "call-1", function: { name: "write", arguments: "{}" } }] })),
  })
  try {
    await expect(collect(request(`${server.url}v1`))).rejects.toThrow("finish reason")
  } finally {
    server.stop(true)
  }
})
test("429 retries are bounded and honor Retry-After", async () => {
  const state = { calls: 0 }
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => {
      state.calls++
      return new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } })
    },
  })
  try {
    await expect(collect(request(`${server.url}v1`))).rejects.toThrow("rate limited")
    expect(state.calls).toBe(3)
  } finally {
    server.stop(true)
  }
})
test("context overflow is a structured error and is not transport-retried", async () => {
  const state = { calls: 0 }
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => {
      state.calls++
      return new Response("maximum context length exceeded", { status: 400 })
    },
  })
  try {
    await expect(collect(request(`${server.url}v1`))).rejects.toMatchObject({ code: "CONTEXT_OVERFLOW" })
    expect(state.calls).toBe(1)
  } finally {
    server.stop(true)
  }
})
test("cancelled HTTP request does not yield completion", async () => {
  const cancellation = new AbortController()
  cancellation.abort()
  await expect(collect({ ...request("http://127.0.0.1:9/v1"), signal: cancellation.signal })).rejects.toThrow(
    "interrupted",
  )
})
