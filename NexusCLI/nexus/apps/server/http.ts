import path from "node:path"
import { z } from "zod"
import type { Check, ModelConfig, NexusAPI } from "../../src/api"
import { detect } from "../../src/project/detect"
import { gitBaseline } from "../../src/git/baseline"
import { NexusError, errorText } from "../../src/shared/errors"
import { defaultSettings, endpointSchema, keyEnvSchema, modeDescriptors, modelPresets } from "../shared/models"
import { diagnoseModel } from "./models"
import { ProjectRegistry } from "../shared/projects"
import type { CheckSummary, ProjectDetail, ProjectTask } from "../shared/protocol"
import { RunManager } from "./runs"

/**
 * The API layer: Frontend -> API Server -> Nexus Core -> Agent Loop.
 *
 * A plain function of its dependencies, so tests drive it with a scripted provider and no
 * socket. Every response is derived from NexusAPI; the server never computes a verdict, and
 * never returns an API key — only whether one is configured.
 */
export type ServerDeps = {
  api: NexusAPI
  registry: ProjectRegistry
  runs: RunManager
  template: ModelConfig
  dataDir: string
  version: string
  env: Record<string, string | undefined>
  /** Directory of the built web interface. When absent, the server is API-only. */
  webDir?: string
}

const createProject = z.object({ path: z.string().min(1), name: z.string().min(1).optional() })
const patchProject = z
  .object({
    name: z.string().min(1),
    presetId: z.string().min(1),
    baseUrl: endpointSchema,
    model: z.string().min(1),
    apiKeyEnv: keyEnvSchema,
    contextLength: z.number().int().min(4096),
    mode: z.enum(["fast", "balanced", "deep"]),
    allowChecks: z.boolean(),
    goalCommand: z.array(z.string().min(1)).min(1).nullable(),
  })
  .partial()
const createRun = z.object({
  projectId: z.string().min(1),
  goal: z.string().min(1),
  mode: z.enum(["fast", "balanced", "deep"]).optional(),
  model: z.string().min(1).optional(),
  answerOnly: z.boolean().optional(),
})
const promptBody = z.object({ text: z.string().min(1), delivery: z.enum(["STEER", "QUEUE"]).optional() })
const permissionBody = z.object({ requestId: z.string().min(1), approved: z.boolean() })
const noteBody = z.object({ note: z.string().min(1) })
const rollbackBody = z.object({ actionId: z.string().min(1), note: z.string().min(1).max(2000) })
const resolveBody = z.object({
  actionId: z.string().min(1),
  outcome: z.enum(["VERIFIED", "FAILED"]),
  note: z.string().min(1),
})
const heartbeatMs = 15000
const status: Record<string, number> = {
  INPUT: 400,
  CONFIG: 400,
  CONFLICT: 409,
  FILE_CONFLICT: 409,
  ROLLBACK_UNAVAILABLE: 409,
  BUSY: 409,
  PERMISSION_DENIED: 403,
  PERMISSION_REQUIRED: 403,
  STATE: 409,
  ABORTED: 499,
}
/** Only loopback origins, so a page the user happens to visit cannot start runs on their machine. */
const allowedOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/

function cors(origin: string | null): Record<string, string> {
  if (!origin || !allowedOrigin.test(origin)) return {}
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  }
}
function json(value: unknown, headers: Record<string, string>, code = 200) {
  return new Response(JSON.stringify(value), {
    status: code,
    headers: { "Content-Type": "application/json", ...headers },
  })
}
async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success)
    throw new NexusError(
      "INPUT",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    )
  return parsed.data
}
function checkSummaries(checks: Check[]): CheckSummary[] {
  return checks.map((check) => ({
    id: check.id,
    description: check.description,
    kind: check.kind,
    argv: check.argv,
  }))
}

export function createRouter(deps: ServerDeps) {
  const segments = (pathname: string) => pathname.split("/").filter(Boolean)

  async function projectDetail(id: string): Promise<ProjectDetail> {
    const project = await deps.registry.get(id)
    const available = await deps.registry.available(project)
    const tasks: ProjectTask[] = deps.api
      .sessions()
      .filter((session) => session.workspace === project.path)
      .map((session) => ({
        sessionId: session.id,
        goal: session.goal,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt)
    if (!available)
      return { ...project, available, kind: "Unavailable", checks: [], tasks, activeRunId: deps.runs.activeFor(id) }
    const detected = await detect(project.path)
    const baseline = await gitBaseline(project.path)
    return {
      ...project,
      available,
      kind: detected.kind,
      packageManager: detected.packageManager,
      checks: checkSummaries(detected.checks),
      branch: baseline.available ? baseline.branch : undefined,
      tasks,
      activeRunId: deps.runs.activeFor(id),
    }
  }

  function stream(id: string, cursor: number, headers: Record<string, string>) {
    const encoder = new TextEncoder()
    const state: { unsubscribe: () => void; closed: boolean; heartbeat?: ReturnType<typeof setInterval> } = {
      unsubscribe: () => {},
      closed: false,
    }
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          if (state.closed) return
          state.closed = true
          clearInterval(state.heartbeat)
          state.unsubscribe()
          controller.close()
        }
        const send = (event: { cursor: number; type: string }) => {
          if (state.closed) return
          controller.enqueue(encoder.encode(`id: ${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`))
          if (event.type === "run_finished") close()
        }
        const subscription = deps.runs.subscribe(id, cursor, send)
        state.unsubscribe = subscription.unsubscribe
        subscription.replay.forEach(send)
        if (!subscription.running) close()
        // A long-thinking turn produces no events; a comment line keeps the connection alive.
        else
          state.heartbeat = setInterval(() => {
            if (!state.closed) controller.enqueue(encoder.encode(": keep-alive\n\n"))
          }, heartbeatMs)
      },
      cancel() {
        state.closed = true
        clearInterval(state.heartbeat)
        state.unsubscribe()
      },
    })
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        ...headers,
      },
    })
  }

  async function serveWeb(pathname: string) {
    if (!deps.webDir) return new Response("Not found", { status: 404 })
    const relative = pathname.replace(/^\/+/, "") || "index.html"
    const target = path.resolve(deps.webDir, relative)
    const file = target.startsWith(path.resolve(deps.webDir)) && (await Bun.file(target).exists())
    return new Response(Bun.file(file ? target : path.join(deps.webDir, "index.html")))
  }

  async function route(request: Request, headers: Record<string, string>): Promise<Response> {
    const url = new URL(request.url)
    const parts = segments(url.pathname)
    const method = request.method
    if (parts[0] !== "api") return await serveWeb(url.pathname)

    if (parts.length === 2 && parts[1] === "health" && method === "GET")
      return json(
        {
          name: "nexus",
          version: deps.version,
          dataDir: deps.dataDir,
          bun: Bun.version,
          executables: Object.fromEntries(
            ["git", "bun", "node", "npm", "python", "cargo", "go", "dotnet"].map((name) => [name, Bun.which(name)]),
          ),
        },
        headers,
      )

    if (parts.length === 2 && parts[1] === "models" && method === "GET")
      return json({ presets: modelPresets(deps.env), modes: modeDescriptors() }, headers)
    if (parts.length === 3 && parts[1] === "models" && ["probe", "discover"].includes(parts[2]!) && method === "POST") {
      const input: unknown = await request.json().catch(() => undefined)
      return json(await diagnoseModel(input, deps.env, parts[2] === "probe"), headers)
    }

    if (parts.length === 2 && parts[1] === "projects") {
      if (method === "GET") {
        const projects = await deps.registry.list()
        return json(
          await Promise.all(
            projects.map(async (project) => ({
              ...project,
              available: await deps.registry.available(project),
            })),
          ),
          headers,
        )
      }
      if (method === "POST") {
        const input = await body(request, createProject)
        const project = await deps.registry.add(input, defaultSettings(deps.template))
        return json(await projectDetail(project.id), headers, 201)
      }
    }
    if (parts.length === 3 && parts[1] === "projects") {
      const id = parts[2]!
      if (method === "GET") return json(await projectDetail(id), headers)
      if (method === "PATCH") {
        const patch = await body(request, patchProject)
        const { goalCommand, ...rest } = patch
        await deps.registry.update(id, {
          ...rest,
          ...("goalCommand" in patch ? { goalCommand: goalCommand ?? undefined } : {}),
        })
        return json(await projectDetail(id), headers)
      }
      if (method === "DELETE") {
        await deps.registry.remove(id)
        return json({ removed: id }, headers)
      }
    }

    if (parts.length === 2 && parts[1] === "runs") {
      if (method === "GET") return json(deps.runs.list(), headers)
      if (method === "POST") return json(await deps.runs.start(await body(request, createRun)), headers, 201)
    }
    if (parts.length === 3 && parts[1] === "runs" && method === "GET") {
      await deps.runs.adopt(parts[2]!)
      return json(deps.runs.summary(parts[2]!), headers)
    }
    if (parts.length === 4 && parts[1] === "runs") {
      const id = parts[2]!
      const action = parts[3]!
      if (method === "GET" && action === "events") {
        await deps.runs.adopt(id)
        return stream(id, Number(url.searchParams.get("cursor") ?? 0) || 0, headers)
      }
      if (method === "GET" && action === "report") {
        await deps.runs.adopt(id)
        return json(deps.runs.report(id), headers)
      }
      if (method === "GET" && action === "diff") {
        await deps.runs.adopt(id)
        return json(deps.runs.diff(id), headers)
      }
      if (method === "POST" && action === "rollback") {
        await deps.runs.adopt(id)
        const input = await body(request, rollbackBody)
        return json(await deps.runs.rollback(id, input.actionId, input.note, request.signal), headers)
      }
      if (method === "POST" && action === "prompt") {
        const input = await body(request, promptBody)
        return json(deps.runs.prompt(id, input.text, input.delivery ?? "STEER"), headers)
      }
      if (method === "POST" && action === "permission") {
        const input = await body(request, permissionBody)
        deps.runs.answerPermission(id, input.requestId, input.approved)
        return json(deps.runs.summary(id), headers)
      }
      if (method === "POST" && action === "resume") {
        await deps.runs.adopt(id)
        return json(deps.runs.resume(id), headers)
      }
      if (method === "POST" && action === "cancel") {
        deps.runs.cancel(id)
        return json(deps.runs.summary(id), headers)
      }
      if (method === "POST" && action === "assert-goal") {
        await deps.runs.assertGoal(id, (await body(request, noteBody)).note)
        return json(deps.runs.report(id), headers)
      }
      if (method === "POST" && action === "trust-checks") {
        await deps.runs.trustChecks(id, (await body(request, noteBody)).note)
        return json(deps.runs.report(id), headers)
      }
      if (method === "POST" && action === "resolve-action") {
        const input = await body(request, resolveBody)
        deps.runs.resolveAction(id, input.actionId, input.outcome, input.note)
        return json(deps.runs.report(id), headers)
      }
    }
    return json({ error: `No route for ${method} ${url.pathname}` }, headers, 404)
  }

  return async function handle(request: Request): Promise<Response> {
    const headers = cors(request.headers.get("Origin"))
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers })
    try {
      return await route(request, headers)
    } catch (error) {
      const code = error instanceof NexusError ? error.code : undefined
      return json({ error: errorText(error), code }, headers, code ? (status[code] ?? 500) : 500)
    }
  }
}
