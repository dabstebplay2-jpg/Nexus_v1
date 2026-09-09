import { afterEach, expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createNexusServer } from "../apps/server/index"
import { endpointSchema, modelPresets } from "../apps/shared/models"
import type { ProbeResponse, ProjectDetail, RunSummary } from "../apps/shared/protocol"

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture(handler?: (request: Request) => Response | Promise<Response>) {
  const root = await mkdtemp(path.join(tmpdir(), "nexus-models-"))
  const workspace = path.join(root, "project")
  await mkdir(workspace)
  const received: { path: string; key: string | null; payload?: Record<string, unknown> }[] = []
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (handler) return handler(request)
      const route = new URL(request.url).pathname
      const payload = request.method === "POST" ? ((await request.json()) as Record<string, unknown>) : undefined
      received.push({ path: route, key: request.headers.get("Authorization"), payload })
      if (route === "/v1/models") return Response.json({ data: [{ id: "model-b" }, { id: "model-a" }] })
      if (route !== "/v1/chat/completions") return new Response(null, { status: 404 })
      const message = "A real HTTP fixture response."
      if (payload?.stream)
        return new Response(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: message }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        )
      return Response.json({ choices: [{ message: { role: "assistant", content: message }, finish_reason: "stop" }] })
    },
  })
  const env = { LOCAL_TEST_KEY: "private-value-no-standard-prefix" }
  const dataDir = path.join(root, "data")
  let server = await createNexusServer({ dataDir, env })
  const listener = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => server.handle(request) })
  cleanups.push(async () => {
    listener.stop(true)
    backend.stop(true)
    server.close()
    Bun.gc(true)
    if (!root.startsWith(path.join(tmpdir(), "nexus-models-"))) throw new Error("Unsafe fixture path")
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 })
  })
  const call = (route: string, input?: unknown, method = "POST") =>
    fetch(`${listener.url.origin}/api${route}`, {
      method,
      ...(input === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
    })
  return {
    backend,
    workspace,
    dataDir,
    received,
    env,
    call,
    input: { baseUrl: `${backend.url.origin}/v1`, presetId: "custom", model: "model-a", apiKeyEnv: "LOCAL_TEST_KEY" },
    restart: async () => {
      server.close()
      server = await createNexusServer({ dataDir, env })
    },
    inspect: (id: string) => server.api.inspect(id),
  }
}

test("local preset URLs are explicit and Unsloth does not inherit LM Studio", () => {
  const urls = Object.fromEntries(modelPresets({}).map((p) => [p.id, p.baseUrl]))
  expect(urls).toMatchObject({
    unsloth: "http://127.0.0.1:8888/v1",
    lmstudio: "http://localhost:1234/v1",
    ollama: "http://localhost:11434/v1",
    llamacpp: "http://localhost:8080/v1",
    vllm: "http://localhost:8000/v1",
    custom: "http://localhost:1234/v1",
  })
})

test("missing model and malformed input are diagnostic states", async () => {
  const f = await fixture()
  expect(await (await f.call("/models/probe", { ...f.input, model: "" })).json()).toMatchObject({
    ok: false,
    stage: "model",
  })
  expect(await (await f.call("/models/probe", null)).json()).toMatchObject({ ok: false, stage: "config" })
})

test("chat HTTP errors retain their upstream status without exposing backend text", async () => {
  const f = await fixture((request) =>
    new URL(request.url).pathname.endsWith("/models")
      ? Response.json({ data: [{ id: "model-a" }] })
      : new Response("private-value-no-standard-prefix", { status: 400 }),
  )
  const response = await f.call("/models/probe", f.input)
  expect(response.status).toBe(200)
  const result = await response.json()
  expect(result).toMatchObject({ ok: false, stage: "chat", statusCode: 400 })
  expect(JSON.stringify(result)).not.toContain(f.env.LOCAL_TEST_KEY)
})

test("failed task transport never leaks the configured key through Core SSE", async () => {
  const f = await fixture(() => new Response("private-value-no-standard-prefix", { status: 401 }))
  const project = (await (await f.call("/projects", { path: f.workspace })).json()) as ProjectDetail
  await f.call(`/projects/${project.id}`, f.input, "PATCH")
  const run = (await (
    await f.call("/runs", { projectId: project.id, goal: "Answer", answerOnly: true })
  ).json()) as RunSummary
  const stream = await (await f.call(`/runs/${run.id}/events`, undefined, "GET")).text()
  expect(stream).toContain("HTTP_401")
  expect(stream).not.toContain(f.env.LOCAL_TEST_KEY)
}, 20000)
test("endpoint normalization accepts custom paths and origin shorthand without duplicating v1", () => {
  expect(endpointSchema.parse(" http://127.0.0.1:9900/ ")).toBe("http://127.0.0.1:9900/v1")
  expect(endpointSchema.parse("https://example.test/proxy/v1///")).toBe("https://example.test/proxy/v1")
})
test.each([
  "garbage",
  "file:///c:/secret",
  "http://user:secret@localhost/v1",
  "http://localhost/v1?key=secret",
  "http://localhost/v1#secret",
  "http://192.168.1.10/v1",
])("invalid endpoint %s produces a safe configuration diagnostic", async (baseUrl) => {
  const f = await fixture()
  const response = await f.call("/models/probe", { ...f.input, baseUrl })
  expect(response.status).toBe(200)
  const result = (await response.json()) as ProbeResponse
  expect(result).toMatchObject({ ok: false, stage: "config", baseUrl: "" })
  expect(JSON.stringify(result)).not.toContain("secret")
  expect(f.received).toHaveLength(0)
})
test("discovery returns backend IDs and never invokes generation", async () => {
  const f = await fixture()
  const result = (await (await f.call("/models/discover", f.input)).json()) as ProbeResponse
  expect(result).toMatchObject({ ok: true, stage: "discovery", discovery: "available", models: ["model-a", "model-b"] })
  expect(f.received.map((r) => r.path)).toEqual(["/v1/models"])
})
test.each([404, 405, 501])("discovery HTTP %i allows manual IDs and Probe still checks chat", async (code) => {
  const f = await fixture((request) =>
    new URL(request.url).pathname.endsWith("/models")
      ? new Response(null, { status: code })
      : Response.json({ choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }] }),
  )
  const discovery = (await (await f.call("/models/discover", f.input)).json()) as ProbeResponse
  expect(discovery).toMatchObject({ ok: false, discovery: "unsupported", statusCode: code })
  const probe = (await (await f.call("/models/probe", f.input)).json()) as ProbeResponse
  expect(probe).toMatchObject({ ok: true, stage: "ready", discovery: "unsupported" })
})
test("network unavailable is connect diagnostic, not HTTP 500", async () => {
  const f = await fixture()
  f.backend.stop(true)
  const response = await f.call("/models/probe", f.input)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ ok: false, stage: "connect", baseUrl: f.input.baseUrl })
})
test("missing selected model is diagnosed before generation", async () => {
  const f = await fixture()
  expect(await (await f.call("/models/probe", { ...f.input, model: "missing" })).json()).toMatchObject({
    ok: false,
    stage: "model",
  })
  expect(f.received).toHaveLength(1)
})
test("successful Probe validates chat, uses the same key and does not return text or secrets", async () => {
  const f = await fixture()
  const response = await f.call("/models/probe", f.input)
  const result = (await response.json()) as ProbeResponse
  expect(result).toMatchObject({ ok: true, stage: "ready", keyConfigured: true })
  expect(JSON.stringify(result)).not.toContain(f.env.LOCAL_TEST_KEY)
  expect(f.received.map((r) => r.key)).toEqual([`Bearer ${f.env.LOCAL_TEST_KEY}`, `Bearer ${f.env.LOCAL_TEST_KEY}`])
  expect(f.received[1]?.payload).toMatchObject({ model: "model-a", stream: false, max_tokens: 32 })
})
test.each([401, 403, 429, 500])(
  "backend HTTP %i has structured diagnostics without backend body/key leakage",
  async (code) => {
    const f = await fixture(() => new Response("private-value-no-standard-prefix", { status: code }))
    const response = await f.call("/models/probe", f.input)
    expect(response.status).toBe(200)
    const result = (await response.json()) as ProbeResponse
    expect(result).toMatchObject({ ok: false, stage: "discovery", statusCode: code })
    expect(JSON.stringify(result)).not.toContain(f.env.LOCAL_TEST_KEY)
  },
)
test("malformed model list and malformed chat success cannot appear connected", async () => {
  const f = await fixture(() => Response.json({ choices: [] }))
  expect(await (await f.call("/models/discover", f.input)).json()).toMatchObject({ ok: false, stage: "discovery" })
  const g = await fixture((request) =>
    new URL(request.url).pathname.endsWith("/models")
      ? Response.json({ data: [{ id: "model-a" }] })
      : Response.json({ choices: [] }),
  )
  expect(await (await g.call("/models/probe", g.input)).json()).toMatchObject({ ok: false, stage: "chat" })
})
test("redirects are refused without forwarding credentials", async () => {
  const f = await fixture(() => new Response(null, { status: 302, headers: { Location: "http://localhost:1/leak" } }))
  expect(await (await f.call("/models/probe", f.input)).json()).toMatchObject({ ok: false, stage: "connect" })
})
test("blank key is optional for local providers; cloud requires a configured key", async () => {
  const f = await fixture()
  expect(await (await f.call("/models/probe", { ...f.input, apiKeyEnv: "" })).json()).toMatchObject({
    ok: true,
    keyConfigured: false,
  })
  expect(f.received.every((r) => r.key === null)).toBe(true)
  expect(await (await f.call("/models/probe", { ...f.input, presetId: "openai", apiKeyEnv: "" })).json()).toMatchObject(
    { ok: false, stage: "config" },
  )
})
test("edited settings survive server restart and drive real provider HTTP, Core response and browser SSE", async () => {
  const f = await fixture()
  const project = (await (await f.call("/projects", { path: f.workspace })).json()) as ProjectDetail
  const patched = (await (
    await f.call(`/projects/${project.id}`, { ...f.input, baseUrl: f.backend.url.origin, mode: "fast" }, "PATCH")
  ).json()) as ProjectDetail
  expect(patched.settings.baseUrl).toBe(f.input.baseUrl)
  await f.restart()
  const saved = (await (await f.call(`/projects/${project.id}`, undefined, "GET")).json()) as ProjectDetail
  expect(saved.settings).toEqual(patched.settings)
  const run = (await (
    await f.call("/runs", { projectId: project.id, goal: "Give a short answer", answerOnly: true })
  ).json()) as RunSummary
  const response = await f.call(`/runs/${run.id}/events`, undefined, "GET")
  expect(response.headers.get("Content-Type")).toBe("text/event-stream")
  const frames = await response.text()
  expect(frames).toContain('"type":"run_finished"')
  expect(frames).not.toMatch(/^event:/m)
  expect(frames).not.toContain(f.env.LOCAL_TEST_KEY)
  expect(
    f
      .inspect(run.id)
      .session.conversation.some((m) => m.role === "assistant" && m.content.includes("real HTTP fixture")),
  ).toBe(true)
  expect(f.inspect(run.id).session.model.baseUrl).toBe(saved.settings.baseUrl)
  expect(f.received.at(-1)?.key).toBe(`Bearer ${f.env.LOCAL_TEST_KEY}`)
  expect(f.received.at(-1)?.payload?.model).toBe("model-a")
  expect(await Bun.file(path.join(f.dataDir, "projects.json")).text()).not.toContain(f.env.LOCAL_TEST_KEY)
}, 20000)
