import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { z } from "zod"
import { hashFile } from "../src/tools/workspace"
import { runProcess } from "../src/tools/process"
import { createNexusServer } from "../apps/server/index"
import type { ProjectDetail, RunReport, RunSummary, StreamEvent } from "../apps/shared/protocol"

/**
 * The product path over real sockets: a real openai-compatible model endpoint, the real API
 * server, real server-sent events, and the run report a UI would render. The independent
 * oracle at the end re-runs the user's scenario itself, so the claim is not taken on trust.
 */
const root = await mkdtemp(path.join(tmpdir(), "nexus-product-smoke-"))
const workspace = path.join(root, "project")
await Bun.write(path.join(workspace, "subject.ts"), "export const add = (a: number, b: number) => a - b\n")
await Bun.write(
  path.join(workspace, "scenario.ts"),
  'import { add } from "./subject"; if (add(2,3) !== 5) process.exit(1)\n',
)

const state = { requests: 0 }
const model = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    z.object({ messages: z.array(z.object({ role: z.string() })) }).parse(await request.json())
    state.requests++
    const call =
      state.requests === 1
        ? { name: "read", arguments: { path: "subject.ts" } }
        : state.requests === 2
          ? {
              name: "edit",
              arguments: {
                path: "subject.ts",
                oldText: "a - b",
                newText: "a + b",
                expectedHash: await hashFile(path.join(workspace, "subject.ts")),
              },
            }
          : undefined
    const delta = call
      ? {
          tool_calls: [
            {
              index: 0,
              id: `call-${state.requests}`,
              function: { name: call.name, arguments: JSON.stringify(call.arguments) },
            },
          ],
        }
      : { content: "The addition bug has been fixed and checked." }
    return new Response(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: call ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    )
  },
})

const webDir = path.resolve("apps/web/dist")
const hasWeb = await Bun.file(path.join(webDir, "index.html")).exists()
await Bun.write(
  path.join(root, "data", "config.json"),
  JSON.stringify({ model: { baseUrl: `${model.url.origin}/v1`, model: "local-smoke", apiKeyEnv: "NEXUS_API_KEY" } }),
)
const server = await createNexusServer({
  dataDir: path.join(root, "data"),
  webDir: hasWeb ? webDir : undefined,
  env: { ...process.env, NEXUS_API_KEY: "" },
})
const listener = Bun.serve({ port: 0, hostname: "127.0.0.1", idleTimeout: 60, fetch: server.handle })
const base = listener.url.origin

async function call<T>(method: string, route: string, payload?: unknown): Promise<T> {
  const response = await fetch(`${base}/api${route}`, {
    method,
    ...(payload === undefined
      ? {}
      : { body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } }),
  })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(`${method} ${route} -> ${response.status} ${JSON.stringify(body)}`)
  return body as T
}
function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(`Product smoke failed: ${message}`)
}

try {
  const project = await call<ProjectDetail>("POST", "/projects", { path: workspace })
  expect(project.available, "the registered project must be available")
  await call<ProjectDetail>("PATCH", `/projects/${project.id}`, {
    allowChecks: true,
    goalCommand: [process.execPath, "scenario.ts"],
  })

  const run = await call<RunSummary>("POST", "/runs", { projectId: project.id, goal: "Fix addition" })
  const response = await fetch(`${base}/api/runs/${run.id}/events`, { headers: { Accept: "text/event-stream" } })
  expect(response.headers.get("Content-Type")?.includes("text/event-stream"), "the stream must be server-sent events")
  const frames = (await response.text())
    .split("\n\n")
    .flatMap((frame) => {
      const line = frame.split("\n").find((row) => row.startsWith("data: "))
      return line ? [JSON.parse(line.slice("data: ".length)) as StreamEvent] : []
    })
    .filter((event) => Boolean(event.type))
  expect(frames.at(0)?.type === "created", "the first streamed event must be created")
  expect(
    frames.at(-1)?.type === "run_finished",
    `the stream must end with run_finished, saw ${String(frames.at(-1)?.type)}`,
  )
  expect(
    frames.map((event) => event.cursor).every((cursor, index) => cursor === index + 1),
    "event cursors must be gapless",
  )

  const report = await call<RunReport>("GET", `/runs/${run.id}/report`)
  expect(report.status === "COMPLETED", `expected COMPLETED, got ${report.status}: ${report.decision?.reason ?? ""}`)
  expect(
    report.changes.files.some((file) => file.path === "subject.ts"),
    "the report must name the changed file",
  )
  expect(
    report.verification.every((check) => check.verdict === "pass"),
    "every check in the report must pass",
  )
  expect(report.evidence.length > 0 && report.evidence.every((item) => item.met), "every criterion must be proved")
  expect(
    report.evidence.every((item) => Boolean(item.evidenceId)),
    "every criterion must cite an evidence id",
  )
  expect(state.requests === 3, `expected 3 model turns, saw ${state.requests}`)

  if (hasWeb) {
    const page = await fetch(`${base}/`)
    expect(page.ok, "the built web interface must be served")
    expect((await page.text()).includes('<div id="root">'), "index.html must be the web shell")
    const missing = await fetch(`${base}/projects/anything`)
    expect(missing.ok, "unknown client routes must fall back to the web shell")
  }

  // Independent oracle: run the user's scenario ourselves rather than believing the report.
  const oracle = await runProcess([process.execPath, "scenario.ts"], workspace, AbortSignal.timeout(10000))
  expect(oracle.exitCode === 0, "the independent oracle must agree the scenario passes")
  server.close()
  console.log("API server → real HTTP/SSE → agent bridge → verification → proved report: passed")
} finally {
  listener.stop(true)
  model.stop(true)
  Bun.gc(true)
  if (!root.startsWith(path.join(tmpdir(), "nexus-product-smoke-"))) throw new Error("Unsafe cleanup path")
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 })
}
