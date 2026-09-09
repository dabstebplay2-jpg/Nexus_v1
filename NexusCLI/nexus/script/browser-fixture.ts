/** Isolated browser regression server. Uses a fixture backend unless NEXUS_E2E_BASE_URL is explicit. */
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createNexusServer } from "../apps/server/index"
import { hashFile } from "../src/tools/workspace"

const root = await mkdtemp(path.join(tmpdir(), "nexus-browser-"))
const workspace = path.join(root, "project")
await Bun.write(path.join(workspace, "add.ts"), "export const add = (a: number, b: number) => a - b\n")
await Bun.write(
  path.join(workspace, "scenario.ts"),
  'import { add } from "./add"; if (add(2,3) !== 5) process.exit(1)\n',
)
const backend = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const route = new URL(request.url).pathname
    if (route.startsWith("/unsupported") && route.endsWith("/models")) return new Response(null, { status: 404 })
    if (route.endsWith("/models"))
      return Response.json({ data: [{ id: "fixture-model-a" }, { id: "fixture-model-b" }] })
    const payload = (await request.json()) as { stream: boolean }
    if (!payload.stream)
      return Response.json({ choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }] })
    const broken = (await Bun.file(path.join(workspace, "add.ts")).text()).includes("a - b")
    const delta = broken
      ? {
          tool_calls: [
            {
              index: 0,
              id: crypto.randomUUID(),
              function: {
                name: "edit",
                arguments: JSON.stringify({
                  path: "add.ts",
                  oldText: "a - b",
                  newText: "a + b",
                  expectedHash: await hashFile(path.join(workspace, "add.ts")),
                }),
              },
            },
          ],
        }
      : { content: "Addition is corrected and checked." }
    return new Response(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: broken ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    )
  },
})
const baseUrl = process.env.NEXUS_E2E_BASE_URL ?? `${backend.url.origin}/v1`
const server = await createNexusServer({
  dataDir: path.join(root, "data"),
  webDir: path.resolve(import.meta.dir, "../apps/web/dist"),
  env: { ...process.env, NEXUS_API_KEY: "" },
})
await server.registry.add(
  { path: workspace },
  {
    presetId: "custom",
    baseUrl,
    model: "select-from-discovery",
    apiKeyEnv: "",
    contextLength: 8192,
    mode: "fast",
    allowChecks: true,
    goalCommand: [process.execPath, "scenario.ts"],
  },
)
const listener = Bun.serve({
  port: 4321,
  hostname: "127.0.0.1",
  idleTimeout: 255,
  fetch(request) {
    if (new URL(request.url).pathname === "/__fixture")
      return Response.json({ baseUrl, workspace, realBackend: Boolean(process.env.NEXUS_E2E_BASE_URL) })
    return server.handle(request)
  },
})
console.log(
  `Browser fixture ${listener.url}, ${process.env.NEXUS_E2E_BASE_URL ? "REAL backend" : "FAKE backend"}: ${baseUrl}`,
)
async function stop() {
  listener.stop(true)
  backend.stop(true)
  server.close()
  Bun.gc(true)
  if (!root.startsWith(path.join(tmpdir(), "nexus-browser-"))) throw new Error("Unsafe cleanup")
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 })
  process.exit(0)
}
process.on("SIGTERM", () => void stop())
process.on("SIGINT", () => void stop())
