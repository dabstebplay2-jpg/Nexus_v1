import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { z } from "zod"
import { hashFile } from "../src/tools/workspace"
import { runProcess } from "../src/tools/process"

const root = await mkdtemp(path.join(tmpdir(), "nexus-smoke-"))
const workspace = path.join(root, "project")
await Bun.write(path.join(workspace, "subject.ts"), "export const add = (a: number, b: number) => a - b\n")
await Bun.write(
  path.join(workspace, "scenario.ts"),
  'import { add } from "./subject"; if (add(2,3) !== 5) process.exit(1)\n',
)
const state = { requests: 0 }
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const body = z
      .object({ messages: z.array(z.object({ role: z.string(), content: z.string().nullable() })) })
      .parse(await request.json())
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
    if (state.requests === 2 && !body.messages.some((message) => message.role === "tool"))
      return new Response("Missing tool result", { status: 400 })
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
try {
  const executable = path.resolve("dist", process.platform === "win32" ? "nexus.exe" : "nexus")
  const child = Bun.spawn(
    [
      executable,
      "run",
      "Fix addition",
      "--workspace",
      workspace,
      "--data-dir",
      path.join(root, "data"),
      "--allow-checks",
      "--goal-command",
      JSON.stringify([process.execPath, "scenario.ts"]),
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env: { ...process.env, NEXUS_BASE_URL: `${server.url}v1`, NEXUS_MODEL: "local-smoke", NEXUS_API_KEY: "" },
    },
  )
  const timer = setTimeout(() => child.kill(), 30000)
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  clearTimeout(timer)
  if (code !== 0 || !stdout.includes("DONE") || state.requests !== 3)
    throw new Error(`CLI smoke failed: ${code}\n${stdout}\n${stderr}`)
  const oracle = await runProcess([process.execPath, "scenario.ts"], workspace, AbortSignal.timeout(5000))
  if (oracle.exitCode !== 0) throw new Error("Independent CLI oracle failed")
  console.log("Standalone CLI → real HTTP/SSE → read → edit → process verification → DONE: passed")
} finally {
  server.stop(true)
  Bun.gc(true)
  if (!root.startsWith(path.join(tmpdir(), "nexus-smoke-"))) throw new Error("Unsafe cleanup path")
  await rm(root, { recursive: true, force: true })
}
