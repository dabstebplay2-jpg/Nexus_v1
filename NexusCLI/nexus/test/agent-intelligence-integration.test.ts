import { expect, test } from "bun:test"
import path from "node:path"
import { z } from "zod"
import { createNexus } from "../src/composition"
import type { PermissionRequest } from "../src/domain/ports"
import { NEVER_AUTOMATIC, type TrustProfile } from "../src/intelligence/trust"
import { PermissionEngine } from "../src/permissions/engine"
import { LocalSandboxProvider } from "../src/sandbox/local"
import { SqliteStore } from "../src/storage/sqlite"
import { ToolExecutor } from "../src/tools/executor"
import { defineTool } from "../src/tools/registry"
import { answer, call, fixture, model } from "./helpers"

test("read-only enforcement precedes schema parsing, permissions and execution", async () => {
  const f = await fixture(() => answer())
  const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Explain the project", model })
    const visited: string[] = []
    const tool = defineTool({
      name: "write",
      description: "Must be blocked before touching input",
      input: z.unknown().transform((input) => {
        visited.push("schema")
        return input
      }),
      sideEffect: true,
      permissions: ["WRITE_PROJECT"],
      execute: async () => {
        visited.push("execution")
        return { output: "unexpected" }
      },
    })
    const permissions = new PermissionEngine({ WRITE_PROJECT: "ask" }, async () => {
      visited.push("permission")
      return true
    })
    const result = await new ToolExecutor(store, permissions, new LocalSandboxProvider()).execute(
      session,
      "turn",
      { id: "call", name: "write", arguments: null },
      tool,
      new AbortController().signal,
      () => visited.push("waiting"),
    )
    expect(visited).toEqual([])
    expect(result.action.status).toBe("FAILED")
    expect(result.action.error).toContain("read-only")
    expect(store.list("evidence", session.id)).toEqual([])
  } finally {
    store.close()
    await f.cleanup()
  }
})

test.each(["coding", "answer"] as const)(
  "persisted sessions without intent retain the %s tool surface",
  async (mode) => {
    const f = await fixture((_request, turn) =>
      mode === "coding" && turn === 1 ? call("read", { path: "add.ts" }) : answer(),
    )
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Explain the project", model, mode })
      const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
      try {
        delete session.intent
        store.save(session)
      } finally {
        store.close()
      }
      await f.api.run(session.id)
      expect(f.api.inspect(session.id).session.intent).toBeUndefined()
      const names = f.provider.requests[0]!.tools.map((tool) => tool.name)
      if (mode === "coding") {
        expect(names).toContain("bash")
        expect(f.api.inspect(session.id).actions[0]!.status).toBe("SUCCEEDED")
        expect(f.api.inspect(session.id).session.status).not.toBe("COMPLETED")
      }
      if (mode === "answer") {
        expect(names).toEqual([])
        expect(f.api.inspect(session.id).session.status).toBe("COMPLETED")
      }
    } finally {
      await f.cleanup()
    }
  },
)

test("permission profiles preserve denies, escalation approval and missing-workspace defaults", async () => {
  const workspace = path.resolve("permission-fixture")
  const profile: TrustProfile = {
    workspace,
    level: "normal",
    rules: [{ action: "bash", pattern: "bun test", permission: "allow" }],
  }
  const request: PermissionRequest = {
    sessionId: "s",
    workspace,
    actionId: "a",
    tool: "bash",
    arguments: { command: "bun test" },
    capabilities: ["RUN_PROCESS"],
    reason: "test",
  }
  const signal = new AbortController().signal
  const authorize = (engine: PermissionEngine, input = request) => engine.authorize(input, signal, () => {})
  await authorize(new PermissionEngine({}, undefined, profile))
  await expect(authorize(new PermissionEngine({ RUN_PROCESS: "deny" }, undefined, profile))).rejects.toThrow(
    "Permission policy denies",
  )
  await expect(
    authorize(new PermissionEngine({}, undefined, profile), { ...request, workspace: undefined }),
  ).rejects.toThrow("Approval required")
  await expect(
    authorize(new PermissionEngine({}, undefined, profile), { ...request, arguments: { command: "bun run build" } }),
  ).rejects.toThrow("Approval required")
  const denied: TrustProfile = { ...profile, rules: [{ action: "bash", permission: "deny" }] }
  await expect(authorize(new PermissionEngine({ RUN_PROCESS: "allow" }, undefined, denied))).rejects.toThrow(
    "Permission policy denies",
  )
  for (const capability of NEVER_AUTOMATIC) {
    const sensitive = { ...request, capabilities: [capability] }
    await expect(authorize(new PermissionEngine({}, undefined, profile), sensitive)).rejects.toThrow(
      "Permission policy denies",
    )
    await expect(
      authorize(new PermissionEngine({ [capability]: "ask" }, undefined, profile), sensitive),
    ).rejects.toThrow("Approval required")
  }
})

test.each(["normal", "trusted-workspace"] as const)(
  "%s trust grants are confined to the selected workspace",
  async (level) => {
    const f = await fixture((_request, turn) => (turn % 2 === 1 ? call("bash", { command: "exit 0" }) : answer()))
    const api = await createNexus({
      dataDir: path.join(f.root, "trusted-data"),
      provider: f.provider,
      trust: {
        workspace: f.workspace,
        level,
        rules: level === "normal" ? [{ action: "bash", pattern: "exit 0", permission: "allow" }] : [],
      },
    })
    try {
      const trusted = await api.create({ workspace: f.workspace, goal: "Run command", model })
      await api.run(trusted.id)
      expect(api.inspect(trusted.id).actions[0]!.status).toBe("SUCCEEDED")
      const other = path.join(f.root, "other-project")
      await Bun.write(path.join(other, "index.ts"), "export {}\n")
      const untrusted = await api.create({ workspace: other, goal: "Run command", model })
      await api.run(untrusted.id)
      expect(api.inspect(untrusted.id).session.status).toBe("WAITING_PERMISSION")
      expect(api.inspect(untrusted.id).actions[0]!.status).toBe("FAILED")
      expect(api.inspect(untrusted.id).actions[0]!.error).toContain("Approval required")
      expect(api.inspect(untrusted.id).evidence).toEqual([])
    } finally {
      api.close()
      await f.cleanup()
    }
  },
)
