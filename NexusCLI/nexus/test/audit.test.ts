import { expect, test } from "bun:test"
import path from "node:path"
import { SqliteStore } from "../src/storage/sqlite"
import { recover } from "../src/recovery/policy"
import { createNexus } from "../src/composition"
import { buildRunReport } from "../apps/shared/run-report"
import { hashFile } from "../src/tools/workspace"
import { commandCapabilities, PermissionEngine } from "../src/permissions/engine"
import { answer, call, fixture, model } from "./helpers"

test("permission classification distinguishes system commands from their arguments and literal registry reads", () => {
  for (const command of [
    "Write-Output format",
    "Write-Output diskpart",
    "Get-Item HKLM:\\Software",
    "Get-ItemProperty -LiteralPath 'HKCU:\\Software'",
  ]) {
    expect(commandCapabilities(command)).not.toContain("SYSTEM_MUTATION")
    expect(new PermissionEngine().evaluate(commandCapabilities(command))).toBe("ask")
  }
  for (const command of [
    "format C:",
    "cmd.exe /c format C:",
    "powershell.exe -NoProfile -Command Set-ExecutionPolicy Unrestricted",
    "  diskpart",
    "Write-Output safe; format C:",
    "Write-Output safe\nSet-ExecutionPolicy Unrestricted",
    "Get-Item HKLM:\\Software; Set-ItemProperty HKLM:\\Software -Name x -Value 1",
    "Get-Item $(Set-ItemProperty HKLM:\\Software -Name x -Value 1)",
  ])
    expect(new PermissionEngine().evaluate(commandCapabilities(command))).toBe("deny")
})

test.skipIf(process.platform !== "win32")(
  "literal read-only shell has low risk and recovery never treats it as an uncertain mutation",
  async () => {
    const f = await fixture((_, turn) => (turn === 1 ? call("bash", { command: "Get-ChildItem -File" }) : answer()))
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Inspect", model })
      await f.api.run(session.id)
      const action = f.api.inspect(session.id).actions.find((action) => action.tool === "bash")!
      expect(action.sideEffect).toBe(false)
      expect(action.risk).toBe("low")
      const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
      try {
        store.put("actions", { ...action, status: "STARTED" })
        expect(await recover(store.get(session.id), store)).toHaveLength(0)
        expect(store.list("actions", session.id).find((item) => item.id === action.id)?.status).toBe("FAILED")
      } finally {
        store.close()
      }
    } finally {
      await f.cleanup()
    }
  },
  15000,
)

test("a completed task with current evidence does not call the provider again", async () => {
  const f = await fixture((_, turn) => {
    if (turn > 1) throw new Error("Provider is now unavailable")
    return answer("Explained.")
  })
  try {
    const session = await f.api.create({
      workspace: f.workspace,
      goal: "Explain",
      model,
      mode: "answer",
      budgets: { maxTurns: 1 },
    })
    expect((await f.api.run(session.id)).status).toBe("COMPLETED")
    expect((await f.api.run(session.id)).status).toBe("COMPLETED")
    expect(f.provider.requests).toHaveLength(1)
  } finally {
    await f.cleanup()
  }
})

test("verify tool cannot mint passing evidence for failing checks", async () => {
  const f = await fixture((_, turn) => (turn === 1 ? call("verify", {}) : answer()))
  try {
    const session = await f.api.create({
      workspace: f.workspace,
      goal: "Check project",
      model,
      goalCheck: {
        id: "failure",
        description: "Fails",
        kind: "GOAL_ASSERTION",
        argv: [process.execPath, "-e", "process.exit(3)"],
        timeoutMs: 5000,
      },
      budgets: { maxTurns: 2 },
    })
    await f.api.run(session.id)
    const report = f.api.inspect(session.id)
    expect(report.evidence.find((item) => item.source === "tool" && item.command === "verify")?.verdict).toBe("fail")
  } finally {
    await f.cleanup()
  }
})

test("verify with no configured checks produces unknown, not proof", async () => {
  const f = await fixture((_, turn) => (turn === 1 ? call("verify", {}) : answer()))
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Check project", model })
    await f.api.run(session.id)
    expect(f.api.inspect(session.id).evidence.find((item) => item.command === "verify")?.verdict).toBe("unknown")
  } finally {
    await f.cleanup()
  }
})

test("recovery returns the durable result of completed tools and identifies unexecuted calls", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Inspect", model })
    const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    try {
      const current = store.get(session.id)
      current.conversation.push({
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "done", name: "read", arguments: { path: "add.ts" } },
          { id: "never", name: "read", arguments: { path: "scenario.ts" } },
        ],
      })
      store.put("actions", {
        id: "done-action",
        sessionId: session.id,
        callId: "done",
        turnId: "turn",
        type: "tool",
        tool: "read",
        implementation: "read@1",
        target: "add.ts",
        reason: "Read",
        arguments: { path: "add.ts" },
        risk: "low",
        sideEffect: false,
        status: "SUCCEEDED",
        startedAt: Date.now(),
        evidenceIds: ["proof"],
        result: { output: "durable content" },
      })
      store.save(current)
      await recover(current, store)
      const outputs = current.conversation.filter((message) => message.role === "tool")
      expect(outputs[0]!.content).toContain("SUCCEEDED")
      expect(outputs[0]!.content).toContain("durable content")
      expect(outputs[1]!.content).toContain("NOT_EXECUTED")
      await recover(current, store)
      expect(current.conversation.filter((message) => message.role === "tool")).toHaveLength(2)
    } finally {
      store.close()
    }
  } finally {
    await f.cleanup()
  }
})

test("completion is revalidated after source changes and pending prompts are not swallowed", async () => {
  const f = await fixture(() => answer("Current explanation"))
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Explain", model, mode: "answer" })
    await f.api.run(session.id)
    await Bun.write(path.join(f.workspace, "new.txt"), "source changed")
    await f.api.run(session.id)
    expect(f.provider.requests).toHaveLength(2)
    f.api.prompt(session.id, "Explain the new file too")
    expect((await f.api.run(session.id)).status).toBe("COMPLETED")
    expect(f.provider.requests).toHaveLength(3)
    expect(
      f.provider.requests
        .at(-1)!
        .messages.some((message) => message.role === "user" && message.content.includes("new file")),
    ).toBe(true)
    const states = f.api
      .inspect(session.id)
      .events.filter((event) => event.type === "state")
      .map((event) => (event.data as { next: string }).next)
    expect(states.slice(0, 7)).toEqual([
      "RECOVERING",
      "UNDERSTANDING",
      "PLANNING",
      "ACTING",
      "OBSERVING",
      "VERIFYING",
      "COMPLETED",
    ])
  } finally {
    await f.cleanup()
  }
})

test("nested verify exposes WAITING_PERMISSION while approval is pending", async () => {
  const f = await fixture((_, turn) => (turn === 1 ? call("verify", {}) : answer()))
  const states: string[] = []
  const api = await createNexus({
    dataDir: path.join(f.root, "nested"),
    provider: f.provider,
    permission: async (request) => {
      states.push(api.inspect(request.sessionId).session.status)
      return true
    },
  })
  try {
    const session = await api.create({
      workspace: f.workspace,
      goal: "Check",
      model,
      goalCheck: {
        id: "ok",
        description: "Trusted no-op test",
        kind: "GOAL_ASSERTION",
        argv: [process.execPath, "-e", "process.exit(0)"],
        timeoutMs: 5000,
      },
    })
    expect((await api.run(session.id)).status).toBe("COMPLETED")
    expect(states).toEqual(["WAITING_PERMISSION"])
  } finally {
    api.close()
    await f.cleanup()
  }
})

test("verify reports failed process startup even when no evidence was emitted", async () => {
  const f = await fixture((_, turn) => (turn === 1 ? call("verify", {}) : answer()))
  try {
    const session = await f.api.create({
      workspace: f.workspace,
      goal: "Check",
      model,
      goalCheck: {
        id: "missing",
        description: "Missing executable",
        kind: "GOAL_ASSERTION",
        argv: ["nexus-audit-missing-executable-8a2429"],
        timeoutMs: 5000,
      },
      budgets: { maxTurns: 2 },
    })
    await f.api.run(session.id)
    expect(f.api.inspect(session.id).evidence.find((item) => item.command === "verify")?.verdict).toBe("fail")
  } finally {
    await f.cleanup()
  }
})

test("report does not present stale goal evidence as satisfied", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Inspect files", model })
    await f.api.assertGoal(session.id, "Checked current files")
    await f.api.run(session.id)
    await Bun.write(path.join(f.workspace, "new.txt"), "changed")
    const result = await f.api.run(session.id)
    expect(result.decision?.outcome).toBe("NEEDS_USER_INPUT")
    const report = buildRunReport(f.api, session.id, result)
    expect(report.evidence.find((item) => item.id === "goal")?.met).toBe(false)
    expect(report.evidence.find((item) => item.id === "goal")?.unsatisfied).toBe(true)
    f.api.prompt(session.id, "Updated requirement")
    const updated = await f.api.run(session.id)
    expect(
      buildRunReport(f.api, session.id, updated).evidence.find((item) => item.id === "goal")?.evidenceId,
    ).toBeUndefined()
  } finally {
    await f.cleanup()
  }
})

test("permission denial suggests inspection, not unrelated goal assertion", async () => {
  const f = await fixture(() => call("write", { path: "new.ts", content: "x", expectedHash: null }), {
    WRITE_PROJECT: "deny",
  })
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Write", model })
    const result = await f.api.run(session.id)
    const report = buildRunReport(f.api, session.id, result)
    expect(report.affordances).toContain("inspect")
    expect(report.affordances).not.toContain("assert-goal")
  } finally {
    await f.cleanup()
  }
})

test("diff provides stable file identity and integrity for future rollback", async () => {
  const f = await fixture(async (_, turn) =>
    turn === 1
      ? call("edit", {
          path: "add.ts",
          oldText: "a - b",
          newText: "a + b",
          expectedHash: await hashFile(path.join(f.workspace, "add.ts")),
        })
      : answer(),
  )
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Fix", model })
    await f.api.run(session.id)
    const patch = f.api.diff(session.id).patches[0]!
    expect(patch.path).toBe("add.ts")
    expect(patch.snapshotIntegrity).toBe("verified")
    expect(patch.created).toBe(false)
    expect(patch.afterHash).toBe(await hashFile(path.join(f.workspace, "add.ts")))
    expect(patch.beforeHash).not.toBe(patch.afterHash)
  } finally {
    await f.cleanup()
  }
})

test("redacted evidence is not advertised as a lossless rollback snapshot", async () => {
  const f = await fixture((_, turn) =>
    turn === 1
      ? call("write", {
          path: "example.ts",
          content: 'export const example = "sk-fakeauditcredential123"',
          expectedHash: null,
        })
      : answer(),
  )
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Write example", model })
    await f.api.run(session.id)
    const patch = f.api.diff(session.id).patches[0]!
    expect(patch.created).toBe(true)
    expect(patch.snapshotIntegrity).toBe("unavailable")
    expect(patch.patch).not.toContain("sk-fakeauditcredential123")
    expect(await Bun.file(path.join(f.workspace, "example.ts")).text()).toContain("sk-fakeauditcredential123")
  } finally {
    await f.cleanup()
  }
})
