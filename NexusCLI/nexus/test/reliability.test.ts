import { expect, test } from "bun:test"
import path from "node:path"
import { symlink } from "node:fs/promises"
import { z } from "zod"
import { SqliteStore } from "../src/storage/sqlite"
import { recover } from "../src/recovery/policy"
import { completionPolicy } from "../src/completion/policy"
import { loopGuard } from "../src/loop-guard/policy"
import { ToolRegistry, defineTool } from "../src/tools/registry"
import { builtinTools } from "../src/tools/builtin"
import { ToolExecutor } from "../src/tools/executor"
import { PermissionEngine } from "../src/permissions/engine"
import { guard, fingerprint, hashFile } from "../src/tools/workspace"
import { bound, redact } from "../src/shared/redact"
import { promote } from "../src/session/inbox"
import { revisePlan } from "../src/planner/plan"
import type { Action, Evidence } from "../src/domain/types"
import { answer, fixture, goalCheck, model } from "./helpers"

function action(sessionId: string, tool = "bash", args: unknown = {}): Action {
  return {
    id: crypto.randomUUID(),
    sessionId,
    turnId: "turn",
    type: "tool",
    tool,
    implementation: "1",
    target: "",
    reason: "test",
    arguments: args,
    risk: "high",
    sideEffect: true,
    status: "STARTED",
    startedAt: Date.now(),
    evidenceIds: [],
  }
}
test("STARTED side effect survives restart as UNKNOWN and is not replayed", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Install", model })
    const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    store.put("actions", action(session.id))
    store.close()
    const result = await f.api.run(session.id)
    expect(result.decision?.outcome).toBe("BLOCKED")
    expect(f.provider.requests).toHaveLength(0)
    expect(f.api.inspect(session.id).actions).toContainEqual(expect.objectContaining({ status: "UNKNOWN" }))
  } finally {
    await f.cleanup()
  }
})
test("interrupted write reconciles intended hash without rewriting", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Write", model })
    const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    try {
      store.put("actions", {
        ...action(session.id, "write"),
        target: "add.ts",
        afterHash: await hashFile(path.join(f.workspace, "add.ts")),
      })
      expect(await recover(store.get(session.id), store)).toHaveLength(0)
      expect(store.list("actions", session.id)[0]?.status).toBe("VERIFIED")
    } finally {
      store.close()
    }
  } finally {
    await f.cleanup()
  }
})
test("completion rejects forged command evidence, stale evidence and UNKNOWN actions", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Fix", model, goalCheck })
    const evidence: Evidence = {
      id: "e",
      sessionId: session.id,
      kind: "GOAL_ASSERTION",
      source: "tool",
      timestamp: Date.now(),
      command: "echo done",
      expected: "pass",
      actual: "pass",
      verdict: "pass",
      metadata: { checkId: "goal" },
      fingerprint: "current",
      contractRevision: 1,
    }
    expect(completionPolicy(session, [], [evidence], "current").outcome).toBe("NEEDS_VERIFICATION")
    expect(completionPolicy(session, [], [{ ...evidence, source: "verification" }], "different").outcome).toBe(
      "NEEDS_VERIFICATION",
    )
    expect(completionPolicy(session, [{ ...action(session.id), status: "UNKNOWN" }], [], "current").outcome).toBe(
      "BLOCKED",
    )
    expect(completionPolicy(session, [], [{ ...evidence, source: "verification" }], "current").outcome).toBe("COMPLETE")
  } finally {
    await f.cleanup()
  }
})
test("modifying the goal harness cannot manufacture success", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({
      workspace: f.workspace,
      goal: "Fix",
      model,
      goalCheck,
      budgets: { maxTurns: 2 },
    })
    await Bun.write(path.join(f.workspace, "scenario.ts"), "process.exit(0)")
    expect((await f.api.run(session.id)).status).not.toBe("COMPLETED")
    expect(f.api.inspect(session.id).evidence).toContainEqual(
      expect.objectContaining({
        verdict: "unknown",
        metadata: expect.objectContaining({ alteredChecks: ["scenario.ts"] }),
      }),
    )
  } finally {
    await f.cleanup()
  }
})
test("Workspace Guard rejects traversal, secrets, Windows devices and junctions", async () => {
  const f = await fixture(() => answer())
  try {
    for (const file of ["../escape", ".env", ".git/config", "file:stream", "NUL", "folder./x"])
      await expect(guard(f.workspace, file)).rejects.toThrow()
    await symlink(path.join(f.root, "data"), path.join(f.workspace, "junction"), "junction")
    await expect(guard(f.workspace, "junction/nexus.db")).rejects.toThrow("Symlink")
  } finally {
    await f.cleanup()
  }
})
test("atomic edits preserve user changes by rejecting stale hashes", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Edit", model })
    const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    try {
      const old = await hashFile(path.join(f.workspace, "add.ts"))
      await Bun.write(path.join(f.workspace, "add.ts"), "user changes")
      const result = await new ToolExecutor(store, new PermissionEngine()).execute(
        session,
        "t",
        { id: "c", name: "write", arguments: { path: "add.ts", expectedHash: old, content: "agent changes" } },
        builtinTools().find((tool) => tool.name === "write")!,
        new AbortController().signal,
        () => {},
      )
      expect(result.action.status).toBe("FAILED")
      expect(await Bun.file(path.join(f.workspace, "add.ts")).text()).toBe("user changes")
    } finally {
      store.close()
    }
  } finally {
    await f.cleanup()
  }
})
test("tool materialization rejects hot-swapped implementations", () => {
  const registry = new ToolRegistry()
  registry.register(
    defineTool({
      name: "read",
      description: "original",
      input: z.object({}),
      execute: async () => ({ output: "old" }),
    }),
  )
  const captured = registry.capture()
  registry.register(
    defineTool({
      name: "read",
      description: "replacement",
      input: z.object({}),
      execute: async () => ({ output: "new" }),
    }),
  )
  expect(() => captured.resolve("read")).toThrow("changed")
})
test("output bounding retains head/tail and redacts common secrets", () => {
  const output = bound("HEAD" + "x".repeat(10000) + "TAIL", 200)
  expect(output.truncated).toBe(true)
  expect(output.text.length).toBeLessThanOrEqual(200)
  expect(output.text).toContain("HEAD")
  expect(output.text).toContain("TAIL")
  expect(redact('api_key="supersecret" Bearer secret-token sk-123456789abcdef')).not.toContain("supersecret")
})
test("inbox exact retries reconcile; conflicts and cross-session ID reuse reject", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Task", model })
    const other = await f.api.create({ workspace: f.workspace, goal: "Other", model })
    const first = f.api.prompt(session.id, "steer", "STEER", "same")
    expect(f.api.prompt(session.id, "steer", "STEER", "same")).toEqual(first)
    expect(() => f.api.prompt(session.id, "changed", "STEER", "same")).toThrow()
    expect(() => f.api.prompt(other.id, "steer", "STEER", "same")).toThrow()
  } finally {
    await f.cleanup()
  }
})
test("inbox promotion and session history commit atomically", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Task", model })
    f.api.prompt(session.id, "first", "QUEUE")
    f.api.prompt(session.id, "second", "QUEUE")
    const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    try {
      promote(store, store.get(session.id), "QUEUE")
      expect(store.list("queued_inputs", session.id).map((input) => input.promoted)).toEqual([true, false])
      expect(store.get(session.id).conversation.at(-1)?.content).toBe("first")
      expect(() =>
        store.transaction(() => {
          promote(store, store.get(session.id), "QUEUE")
          throw new Error("rollback")
        }),
      ).toThrow()
      expect(store.list("queued_inputs", session.id).map((input) => input.promoted)).toEqual([true, false])
    } finally {
      store.close()
    }
  } finally {
    await f.cleanup()
  }
})
test("LoopGuard detects repeated errors, oscillation, rewrites and budget exhaustion", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Task", model })
    const failures = [1, 2, 3].map((index) => ({
      ...action(session.id, `tool_${index}`),
      status: "FAILED" as const,
      error: "same failure",
    }))
    expect(loopGuard(session, failures, [])?.reason).toContain("error repeated")
    const oscillation = ["a", "b", "a", "b"].map((name) => action(session.id, name))
    expect(loopGuard(session, oscillation, [])?.action).toBe("CHANGE_STRATEGY")
    const writes = [1, 2, 3, 4].map((value) => ({ ...action(session.id, "write", { value }), target: "one.ts" }))
    expect(loopGuard(session, writes, [])?.action).toBe("REPLAN")
    expect(loopGuard({ ...session, turns: 8 }, [], [])?.reason).toContain("without new")
    expect(loopGuard({ ...session, turns: session.budgets.maxTurns }, [], [])?.action).toBe("STOP")
  } finally {
    await f.cleanup()
  }
})
test("Planner rejects cycles and unsupported DONE claims", () => {
  const step = { id: "a", description: "A", state: "DONE", dependencies: [], evidence: [], note: "done" }
  expect(() => revisePlan([step], [], [])).toThrow("evidence")
  expect(() => revisePlan([{ ...step, state: "PENDING", dependencies: ["a"] }], [], [])).toThrow("cycle")
})
test("permission ask can approve one action with no global mocks", async () => {
  const permission = new PermissionEngine({ RUN_PROCESS: "ask" }, async () => true)
  const state = { waiting: false }
  await permission.authorize(
    { sessionId: "s", actionId: "a", tool: "bash", arguments: {}, capabilities: ["RUN_PROCESS"], reason: "test" },
    new AbortController().signal,
    () => {
      state.waiting = true
    },
  )
  expect(state.waiting).toBe(true)
})
test("separate API owners cannot run concurrently in the same workspace", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Task", model })
    const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    const release = store.acquire(session.id, session.workspace)
    try {
      await expect(f.api.run(session.id)).rejects.toThrow("owned")
    } finally {
      release()
      store.close()
    }
  } finally {
    await f.cleanup()
  }
})
