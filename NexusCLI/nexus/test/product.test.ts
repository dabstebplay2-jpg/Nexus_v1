import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { ScriptedProvider, answer, brokenAdd, plainScenario } from "./helpers"
import type { ModelEvent, ModelRequest } from "../src/domain/ports"
import { hashFile } from "../src/tools/workspace"
import { createNexusServer } from "../apps/server/index"
import type { ModelsResponse, ProjectDetail, RunReport, RunSummary, StreamEvent } from "../apps/shared/protocol"

/**
 * Product-layer end to end: HTTP request -> agent bridge -> Agent Loop -> verification ->
 * run report. Driven through the real fetch handler with a scripted provider, so these tests
 * prove the product path without a socket and without a live model.
 */
/** The real fix, applied the way the core requires: a hash-guarded edit. */
const fixAdd = async (workspace: string): Promise<ModelEvent[]> => [
  {
    type: "tool",
    call: {
      id: crypto.randomUUID(),
      name: "edit",
      arguments: {
        path: "add.ts",
        oldText: "a - b",
        newText: "a + b",
        expectedHash: await hashFile(path.join(workspace, "add.ts")),
      },
    },
  },
  { type: "finish" },
]
/** A check that rewrites project source cannot have its exit code attributed to the agent. */
const sourceMutatingScenario =
  'import { add } from "./add"; await Bun.write("add.ts", (await Bun.file("add.ts").text()) + "// touched\\n"); if (add(2, 3) !== 5) process.exit(1)\n'

async function harness(
  tree: Record<string, string>,
  script: (request: ModelRequest, turn: number) => Promise<ModelEvent[]> | ModelEvent[],
  env: Record<string, string | undefined> = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), "nexus-product-"))
  const workspace = path.join(root, "project")
  for (const [file, content] of Object.entries(tree)) await Bun.write(path.join(workspace, file), content)
  const server = await createNexusServer({
    dataDir: path.join(root, "data"),
    provider: new ScriptedProvider(script),
    env,
  })
  const call = async (method: string, route: string, payload?: unknown) =>
    await server.handle(
      new Request(`http://127.0.0.1/api${route}`, {
        method,
        ...(payload === undefined
          ? {}
          : { body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } }),
      }),
    )
  const jsonOf = async <T>(response: Response): Promise<T> => (await response.json()) as T
  return {
    root,
    workspace,
    server,
    call,
    jsonOf,
    /** Registers the workspace and applies the settings a run needs. */
    project: async (settings: Record<string, unknown> = {}) => {
      const created = await jsonOf<ProjectDetail>(await call("POST", "/projects", { path: workspace }))
      const detail = Object.keys(settings).length
        ? await jsonOf<ProjectDetail>(await call("PATCH", `/projects/${created.id}`, settings))
        : created
      return detail
    },
    cleanup: async () => {
      server.close()
      Bun.gc(true)
      if (!root.startsWith(path.join(tmpdir(), "nexus-product-"))) throw new Error("Unsafe fixture cleanup path")
      await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 })
    },
  }
}

/** SSE frames until the server closes the stream, which it does on run_finished. */
async function streamEvents(response: Response): Promise<StreamEvent[]> {
  const body = await response.text()
  return body
    .split("\n\n")
    .flatMap((frame) => {
      const line = frame.split("\n").find((row) => row.startsWith("data: "))
      return line ? [JSON.parse(line.slice("data: ".length)) as StreamEvent] : []
    })
    .filter((event) => Boolean(event.type))
}

const goalCommand = [process.execPath, "scenario.ts"]

describe("Product layer: opening a project", () => {
  test("registering a directory reports the real detected project, not a guess", async () => {
    const f = await harness(
      { "add.ts": brokenAdd, "scenario.ts": plainScenario, "package.json": '{"scripts":{"test":"bun test"}}' },
      () => answer(),
    )
    try {
      const detail = await f.jsonOf<ProjectDetail>(await f.call("POST", "/projects", { path: f.workspace }))
      expect(detail.kind).toBe("Node/TypeScript")
      expect(detail.available).toBe(true)
      expect(detail.checks.map((check) => check.id)).toContain("test")
      expect(detail.settings.presetId).toBeTruthy()
      const listed = await f.jsonOf<ProjectDetail[]>(await f.call("GET", "/projects"))
      expect(listed.map((project) => project.id)).toEqual([detail.id])
    } finally {
      await f.cleanup()
    }
  }, 20000)

  test("a missing directory is refused instead of registered", async () => {
    const f = await harness({ "add.ts": brokenAdd }, () => answer())
    try {
      const response = await f.call("POST", "/projects", { path: path.join(f.root, "does-not-exist") })
      expect(response.status).toBe(400)
      expect((await f.jsonOf<{ error: string }>(response)).error).toContain("No such directory")
    } finally {
      await f.cleanup()
    }
  }, 20000)
})

describe("Product layer: the MVP path", () => {
  test("a task streams events and ends with a report that proves the result", async () => {
    const f = await harness({ "add.ts": brokenAdd, "scenario.ts": plainScenario }, async (_, turn) =>
      turn === 1 ? await fixAdd(f.workspace) : answer("Corrected the operator."),
    )
    try {
      const project = await f.project({ allowChecks: true, goalCommand, mode: "fast" })
      expect(project.settings.allowChecks).toBe(true)

      const run = await f.jsonOf<RunSummary>(
        await f.call("POST", "/runs", { projectId: project.id, goal: "Fix addition" }),
      )
      expect(run.id).toBeTruthy()
      // Modes are budgets, not labels.
      expect(f.server.api.inspect(run.id).session.budgets.maxTurns).toBe(12)

      const events = await streamEvents(await f.call("GET", `/runs/${run.id}/events`))
      expect(events.at(0)?.type).toBe("created")
      expect(events.map((event) => event.type)).toContain("state")
      expect(events.map((event) => event.type)).toContain("tool")
      expect(events.at(-1)?.type).toBe("run_finished")
      // Cursors are gapless, so a reconnecting client can replay exactly what it missed.
      expect(events.map((event) => event.cursor)).toEqual(events.map((_, index) => index + 1))

      const report = await f.jsonOf<RunReport>(await f.call("GET", `/runs/${run.id}/report`))
      expect(report.status).toBe("COMPLETED")
      expect(report.decision?.outcome).toBe("COMPLETE")
      expect(report.changes.files.map((file) => file.path)).toEqual(["add.ts"])
      expect(report.changes.files[0]?.added).toBeGreaterThan(0)
      expect(report.verification.map((check) => check.checkId)).toContain("goal")
      expect(report.verification.every((check) => check.verdict === "pass")).toBe(true)
      expect(report.evidence.length).toBeGreaterThan(0)
      expect(report.evidence.every((criterion) => criterion.met)).toBe(true)
      expect(report.evidence.every((criterion) => Boolean(criterion.evidenceId))).toBe(true)
      expect(report.proposal?.verified).toBe(true)
      expect(report.affordances).toEqual([])

      const diff = await f.jsonOf<{ patches: { patch: string }[] }>(await f.call("GET", `/runs/${run.id}/diff`))
      expect(diff.patches[0]?.patch).toContain("a + b")
    } finally {
      await f.cleanup()
    }
  }, 30000)

  test("replaying from a cursor returns only the events after it", async () => {
    const f = await harness({ "add.ts": brokenAdd, "scenario.ts": plainScenario }, async (_, turn) =>
      turn === 1 ? await fixAdd(f.workspace) : answer("Corrected the operator."),
    )
    try {
      const project = await f.project({ allowChecks: true, goalCommand })
      const run = await f.jsonOf<RunSummary>(
        await f.call("POST", "/runs", { projectId: project.id, goal: "Fix addition" }),
      )
      const all = await streamEvents(await f.call("GET", `/runs/${run.id}/events`))
      const tail = await streamEvents(await f.call("GET", `/runs/${run.id}/events?cursor=3`))
      expect(all.length).toBeGreaterThan(3)
      expect(tail.map((event) => event.cursor)).toEqual(all.slice(3).map((event) => event.cursor))
    } finally {
      await f.cleanup()
    }
  }, 30000)
})

describe("Product layer: evidence before completion", () => {
  test("an unprovable check is reported as UNKNOWN over HTTP, with a way out", async () => {
    const f = await harness({ "add.ts": brokenAdd, "scenario.ts": sourceMutatingScenario }, () =>
      answer("I believe this is fixed."),
    )
    try {
      const project = await f.project({ allowChecks: true, goalCommand })
      const run = await f.jsonOf<RunSummary>(
        await f.call("POST", "/runs", { projectId: project.id, goal: "Fix addition" }),
      )
      const events = await streamEvents(await f.call("GET", `/runs/${run.id}/events`))
      expect(events.at(-1)?.type).toBe("run_finished")

      const report = await f.jsonOf<RunReport>(await f.call("GET", `/runs/${run.id}/report`))
      expect(report.status).toBe("UNKNOWN")
      expect(report.status).not.toBe("COMPLETED")
      expect(report.verification[0]?.verdict).toBe("unknown")
      expect(report.verification[0]?.unknownReason).toContain("add.ts")
      expect(report.verification[0]?.sourceChanges).toContain("add.ts")
      expect(report.evidence.some((criterion) => criterion.unsatisfied)).toBe(true)
      // UNKNOWN must not be a dead end in a UI.
      expect(report.affordances).toContain("trust-checks")
      expect(report.affordances).toContain("assert-goal")
      expect(report.proposal?.verified).toBe(false)
      expect((await f.jsonOf<RunSummary>(await f.call("GET", `/runs/${run.id}`))).status).toBe("UNKNOWN")
    } finally {
      await f.cleanup()
    }
  }, 30000)

  test("a manual assertion is recorded as user evidence, not as a passing check", async () => {
    const f = await harness({ "add.ts": brokenAdd, "scenario.ts": sourceMutatingScenario }, () =>
      answer("I believe this is fixed."),
    )
    try {
      const project = await f.project({ allowChecks: true, goalCommand })
      const run = await f.jsonOf<RunSummary>(
        await f.call("POST", "/runs", { projectId: project.id, goal: "Fix addition" }),
      )
      await streamEvents(await f.call("GET", `/runs/${run.id}/events`))
      const refused = await f.call("POST", `/runs/${run.id}/assert-goal`, { note: "  " })
      expect(refused.status).toBe(400)
      const report = await f.jsonOf<RunReport>(
        await f.call("POST", `/runs/${run.id}/assert-goal`, { note: "Ran the scenario by hand" }),
      )
      // The session is still UNKNOWN: only the completion policy may promote it, on the next run.
      expect(report.status).toBe("UNKNOWN")
      expect(
        f.server.api.inspect(run.id).evidence.some((item) => item.source === "user" && item.kind === "GOAL_ASSERTION"),
      ).toBe(true)
    } finally {
      await f.cleanup()
    }
  }, 30000)
})

describe("Product layer: permissions and concurrency", () => {
  test("a check without pre-approval waits for the user and proceeds once approved", async () => {
    const f = await harness({ "add.ts": brokenAdd, "scenario.ts": plainScenario }, async (_, turn) =>
      turn === 1 ? await fixAdd(f.workspace) : answer("Corrected the operator."),
    )
    try {
      const project = await f.project({ allowChecks: false, goalCommand })
      const run = await f.jsonOf<RunSummary>(
        await f.call("POST", "/runs", { projectId: project.id, goal: "Fix addition" }),
      )
      const streaming = streamEvents(await f.call("GET", `/runs/${run.id}/events`))
      const stale = await f.call("POST", `/runs/${run.id}/permission`, { requestId: "nope", approved: true })
      expect(stale.status).toBe(400)
      // What a UI does: watch for a pending request and answer it.
      const prompts: NonNullable<RunSummary["pendingPermission"]>[] = []
      for (let attempt = 0; attempt < 400; attempt++) {
        const summary = await f.jsonOf<RunSummary>(await f.call("GET", `/runs/${run.id}`))
        if (summary.pendingPermission) {
          prompts.push(summary.pendingPermission)
          await f.call("POST", `/runs/${run.id}/permission`, {
            requestId: summary.pendingPermission.requestId,
            approved: true,
          })
        }
        if (!summary.running) break
        await Bun.sleep(15)
      }
      const events = await streaming
      expect(prompts.length).toBeGreaterThan(0)
      expect(prompts[0]?.capabilities).toEqual(["RUN_TESTS"])
      expect(prompts[0]?.tool).toBe("check_goal")
      expect(events.map((event) => event.type)).toContain("permission_request")
      expect(events.map((event) => event.type)).toContain("permission_resolved")
      const report = await f.jsonOf<RunReport>(await f.call("GET", `/runs/${run.id}/report`))
      expect(report.status).toBe("COMPLETED")
    } finally {
      await f.cleanup()
    }
  }, 30000)

  test("a second run in the same project is refused while one is in progress", async () => {
    const gate: { release: () => void } = { release: () => {} }
    const held = new Promise<void>((resolve) => {
      gate.release = resolve
    })
    const f = await harness({ "add.ts": brokenAdd, "scenario.ts": plainScenario }, async (_, turn) => {
      if (turn === 1) await held
      return turn === 1 ? await fixAdd(f.workspace) : answer("Corrected the operator.")
    })
    try {
      const project = await f.project({ allowChecks: true, goalCommand })
      const first = await f.jsonOf<RunSummary>(
        await f.call("POST", "/runs", { projectId: project.id, goal: "Fix addition" }),
      )
      const conflict = await f.call("POST", "/runs", { projectId: project.id, goal: "Fix addition again" })
      expect(conflict.status).toBe(409)
      expect((await f.jsonOf<{ error: string }>(conflict)).error).toContain(first.id)
      gate.release()
      await streamEvents(await f.call("GET", `/runs/${first.id}/events`))
      expect((await f.jsonOf<RunSummary>(await f.call("GET", `/runs/${first.id}`))).running).toBe(false)
    } finally {
      gate.release()
      await f.cleanup()
    }
  }, 30000)

  test("cancelling a run stops it without claiming completion", async () => {
    const gate: { release: () => void } = { release: () => {} }
    const held = new Promise<void>((resolve) => {
      gate.release = resolve
    })
    const f = await harness({ "add.ts": brokenAdd, "scenario.ts": plainScenario }, async (_, turn) => {
      if (turn === 1) await held
      return answer("Done.")
    })
    try {
      const project = await f.project({ allowChecks: true, goalCommand })
      const run = await f.jsonOf<RunSummary>(
        await f.call("POST", "/runs", { projectId: project.id, goal: "Fix addition" }),
      )
      await f.call("POST", `/runs/${run.id}/cancel`)
      gate.release()
      const events = await streamEvents(await f.call("GET", `/runs/${run.id}/events`))
      expect(events.at(-1)?.type).toBe("run_finished")
      const report = await f.jsonOf<RunReport>(await f.call("GET", `/runs/${run.id}/report`))
      expect(report.status).not.toBe("COMPLETED")
    } finally {
      gate.release()
      await f.cleanup()
    }
  }, 30000)
})

describe("Product layer: model management", () => {
  test("presets report whether a key is configured and never the key itself", async () => {
    const secret = "sk-test-do-not-leak-0123456789"
    const f = await harness({ "add.ts": brokenAdd }, () => answer(), {
      OPENAI_API_KEY: secret,
      ANTHROPIC_API_KEY: undefined,
    })
    try {
      const response = await f.call("GET", "/models")
      const raw = await response.clone().text()
      expect(raw).not.toContain(secret)
      const models = await f.jsonOf<ModelsResponse>(response)
      expect(models.presets.find((preset) => preset.id === "openai")?.keyConfigured).toBe(true)
      expect(models.presets.find((preset) => preset.id === "anthropic")?.keyConfigured).toBe(false)
      expect(models.presets.map((preset) => preset.id)).toContain("ollama")
      expect(models.presets.map((preset) => preset.id)).toContain("lmstudio")
      expect(models.modes.map((mode) => mode.id)).toEqual(["fast", "balanced", "deep"])
      expect(models.modes.find((mode) => mode.id === "deep")?.maxTurns).toBeGreaterThan(
        models.modes.find((mode) => mode.id === "fast")!.maxTurns,
      )
    } finally {
      await f.cleanup()
    }
  }, 20000)
})

describe("Product layer: project memory", () => {
  test("settings persist and task history comes from the core ledger", async () => {
    const f = await harness({ "add.ts": brokenAdd, "scenario.ts": plainScenario }, async (_, turn) =>
      turn === 1 ? await fixAdd(f.workspace) : answer("Corrected the operator."),
    )
    try {
      const project = await f.project({ allowChecks: true, goalCommand, mode: "deep", model: "custom-model" })
      expect(project.settings.mode).toBe("deep")
      expect(project.settings.model).toBe("custom-model")
      expect(project.settings.goalCommand).toEqual(goalCommand)
      expect(project.tasks).toEqual([])

      const run = await f.jsonOf<RunSummary>(
        await f.call("POST", "/runs", { projectId: project.id, goal: "Fix addition" }),
      )
      await streamEvents(await f.call("GET", `/runs/${run.id}/events`))
      const reloaded = await f.jsonOf<ProjectDetail>(await f.call("GET", `/projects/${project.id}`))
      expect(reloaded.tasks.map((task) => task.sessionId)).toEqual([run.id])
      expect(reloaded.tasks[0]?.status).toBe("COMPLETED")
      expect(reloaded.tasks[0]?.goal).toBe("Fix addition")
      expect(reloaded.activeRunId).toBeUndefined()

      const registry = await Bun.file(path.join(f.root, "data", "projects.json")).json()
      expect(registry.projects[0].settings.mode).toBe("deep")
    } finally {
      await f.cleanup()
    }
  }, 30000)

  test("an unknown route and an unknown run are refused clearly", async () => {
    const f = await harness({ "add.ts": brokenAdd }, () => answer())
    try {
      expect((await f.call("GET", "/nope")).status).toBe(404)
      const missing = await f.call("GET", "/runs/00000000-0000-0000-0000-000000000000/report")
      expect(missing.status).toBe(400)
      expect((await f.jsonOf<{ error: string }>(missing)).error).toContain("Unknown run")
    } finally {
      await f.cleanup()
    }
  }, 20000)
})
