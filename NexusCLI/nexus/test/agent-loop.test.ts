import { describe, expect, test } from "bun:test"
import path from "node:path"
import { createNexus } from "../src/composition"
import { hashFile } from "../src/tools/workspace"
import { NexusError, cancellable } from "../src/shared/errors"
import { answer, call, fixture, goalCheck, model, ScriptedProvider } from "./helpers"

describe("AgentLoop scenarios with real storage/files/processes and scripted LLM", () => {
  test("prompt → informational answer", async () => {
    const f = await fixture(() => answer("Hello"))
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Say hello", model, mode: "answer" })
      expect((await f.api.run(session.id)).status).toBe("COMPLETED")
      expect(f.api.inspect(session.id).evidence.length).toBe(1)
    } finally {
      await f.cleanup()
    }
  })
  test("read → edit → real test → evidence-backed completion", async () => {
    const f = await fixture(async (request, turn) => {
      if (turn === 1) return call("read", { path: "add.ts" })
      if (turn === 2) {
        const read = JSON.parse(request.messages.findLast((message) => message.role === "tool")!.content)
        return call("edit", {
          path: "add.ts",
          oldText: "a - b",
          newText: "a + b",
          expectedHash: JSON.parse(read.metadata).hash,
        })
      }
      return answer()
    })
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Fix addition", model, goalCheck })
      const result = await f.api.run(session.id)
      expect(result.status).toBe("COMPLETED")
      expect(await Bun.file(path.join(f.workspace, "add.ts")).text()).toContain("a + b")
      expect(f.api.inspect(session.id).actions).toHaveLength(3)
      expect(result.decision?.outcome).toBe("COMPLETE")
    } finally {
      await f.cleanup()
    }
  })
  test("false model completion is rejected and bounded", async () => {
    const f = await fixture(() => answer("DONE, all tests pass"))
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Fix addition",
        model,
        goalCheck,
        budgets: { maxTurns: 3 },
      })
      const result = await f.api.run(session.id)
      expect(result.status).toBe("FAILED")
      expect(result.turns).toBe(3)
      expect(f.api.inspect(session.id).evidence).toContainEqual(expect.objectContaining({ verdict: "fail" }))
    } finally {
      await f.cleanup()
    }
  })
  test("build alone cannot prove arbitrary user goal", async () => {
    const f = await fixture(() => answer("Done"))
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Fix login", model })
      const result = await f.api.run(session.id)
      expect(result.decision?.outcome).toBe("NEEDS_USER_INPUT")
      expect(result.status).not.toBe("COMPLETED")
    } finally {
      await f.cleanup()
    }
  })
  test("tool input error returns evidence to next turn and permits recovery", async () => {
    const f = await fixture((_, turn) => (turn === 1 ? call("read", { path: "missing.ts" }) : answer()))
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Inspect files", model })
      await f.api.run(session.id)
      expect(
        f.provider.requests[1]?.messages.some(
          (message) => message.role === "tool" && message.content.includes("error"),
        ),
      ).toBe(true)
    } finally {
      await f.cleanup()
    }
  })
  test("permission deny executes nothing", async () => {
    const f = await fixture(() => call("write", { path: "new.ts", content: "x", expectedHash: null }), {
      WRITE_PROJECT: "deny",
    })
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Write", model })
      expect((await f.api.run(session.id)).decision?.outcome).toBe("NEEDS_USER_INPUT")
      expect(await Bun.file(path.join(f.workspace, "new.ts")).exists()).toBe(false)
    } finally {
      await f.cleanup()
    }
  })
  test("permission ask without UI is durable WAITING_PERMISSION", async () => {
    const f = await fixture(() => call("bash", { command: "echo hello" }), {})
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Run", model })
      expect((await f.api.run(session.id)).status).toBe("WAITING_PERMISSION")
      expect(f.api.inspect(session.id).actions).toContainEqual(expect.objectContaining({ status: "FAILED" }))
    } finally {
      await f.cleanup()
    }
  })
  test("model error is structured and durable", async () => {
    const f = await fixture(() => {
      throw new NexusError("HTTP_401", "Invalid credentials")
    })
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Hello", model })
      expect((await f.api.run(session.id)).status).toBe("FAILED")
      expect(f.api.inspect(session.id).turns).toContainEqual(
        expect.objectContaining({ status: "FAILED", error: "Invalid credentials" }),
      )
    } finally {
      await f.cleanup()
    }
  })
  test("context overflow compacts into a new durable epoch", async () => {
    const f = await fixture((_, turn) => {
      if (turn === 1) throw new NexusError("CONTEXT_OVERFLOW", "Too long")
      return answer()
    })
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Hello", model, mode: "answer" })
      const result = await f.api.run(session.id)
      expect(result.status).toBe("COMPLETED")
      expect(result.epoch).toBe(1)
      expect(f.api.inspect(session.id).epochs.length).toBeGreaterThan(1)
    } finally {
      await f.cleanup()
    }
  })
  test("provider timeout cannot complete", async () => {
    const f = await fixture(async (request) => {
      await cancellable(new Promise<void>(() => {}), request.signal)
      return answer()
    })
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Hello",
        model,
        budgets: { providerTimeoutMs: 20 },
      })
      expect((await f.api.run(session.id)).status).toBe("FAILED")
    } finally {
      await f.cleanup()
    }
  })
  test("process interruption is ABORTED", async () => {
    const cancellation = new AbortController()
    const f = await fixture(async () => {
      cancellation.abort()
      return answer()
    })
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Hello", model })
      expect((await f.api.run(session.id, cancellation.signal)).status).toBe("ABORTED")
    } finally {
      await f.cleanup()
    }
  })
  test("STEER promotes at the next safe boundary", async () => {
    const f = await fixture((_, turn) => {
      if (turn === 1) {
        f.api.prompt(f.api.sessions()[0]!.id, "Also explain the result")
        return call("read", { path: "add.ts" })
      }
      return answer()
    })
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Inspect", model })
      await f.api.run(session.id)
      expect(
        f.provider.requests[1]?.messages.some(
          (message) => message.role === "user" && message.content === "Also explain the result",
        ),
      ).toBe(true)
      expect(f.api.inspect(session.id).inputs[0]?.promoted).toBe(true)
    } finally {
      await f.cleanup()
    }
  })
  test("queue FIFO promotes one item at each idle boundary", async () => {
    const f = await fixture(() => answer())
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Hello", model, mode: "answer" })
      f.api.prompt(session.id, "Second", "QUEUE")
      f.api.prompt(session.id, "Third", "QUEUE")
      const result = await f.api.run(session.id)
      expect(result.status).toBe("COMPLETED")
      expect(f.provider.requests).toHaveLength(3)
      expect(
        f.provider.requests[1]?.messages.filter((message) => message.role === "user").map((message) => message.content),
      ).toEqual(["Hello", "Second"])
      expect(f.api.inspect(session.id).inputs.every((input) => input.promoted)).toBe(true)
    } finally {
      await f.cleanup()
    }
  })
  test("repeated reads stop instead of looping indefinitely", async () => {
    const f = await fixture(() => call("read", { path: "add.ts" }))
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Inspect", model })
      const result = await f.api.run(session.id)
      expect(result.status).toBe("FAILED")
      expect(result.turns).toBeLessThanOrEqual(8)
      expect(f.api.inspect(session.id).events.some((event) => event.type === "loop_guard")).toBe(true)
    } finally {
      await f.cleanup()
    }
  })
  test("concurrent independent sessions and same-session joining", async () => {
    const f = await fixture(async () => {
      await Bun.sleep(30)
      return answer()
    })
    const other = await fixture(() => answer())
    try {
      const a = await f.api.create({ workspace: f.workspace, goal: "A", model, mode: "answer" })
      const b = await f.api.create({ workspace: other.workspace, goal: "B", model, mode: "answer" })
      const results = await Promise.all([f.api.run(a.id), f.api.run(a.id), f.api.run(b.id)])
      expect(results.map((result) => result.status)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED"])
      expect(f.provider.requests).toHaveLength(2)
    } finally {
      await f.cleanup()
      await other.cleanup()
    }
  })
  test("manual goal assertion survives restart and becomes stale after edits", async () => {
    const f = await fixture(() => answer())
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Inspect addition", model })
      await f.api.run(session.id)
      await f.api.assertGoal(session.id, "I exercised the scenario")
      const reopened = await createNexus({
        dataDir: path.join(f.root, "data"),
        provider: new ScriptedProvider(() => answer()),
      })
      try {
        expect((await reopened.run(session.id)).status).toBe("COMPLETED")
      } finally {
        reopened.close()
      }
      await Bun.write(path.join(f.workspace, "add.ts"), "changed")
      expect((await f.api.run(session.id)).status).not.toBe("COMPLETED")
    } finally {
      await f.cleanup()
    }
  })
  test("verification failure can be repaired on a later turn", async () => {
    const f = await fixture(async (_, turn) => {
      if (turn === 1) return answer("I think it is done")
      if (turn === 2)
        return call("edit", {
          path: "add.ts",
          oldText: "a - b",
          newText: "a + b",
          expectedHash: await hashFile(path.join(f.workspace, "add.ts")),
        })
      return answer("Repaired")
    })
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Fix addition", model, goalCheck })
      expect((await f.api.run(session.id)).status).toBe("COMPLETED")
      expect(f.api.inspect(session.id).evidence).toContainEqual(
        expect.objectContaining({ source: "verification", verdict: "fail" }),
      )
    } finally {
      await f.cleanup()
    }
  })
  test("fix failing tests automatically requires reproduction and subsequent pass", async () => {
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
      await Bun.write(
        path.join(f.workspace, "package.json"),
        JSON.stringify({ scripts: { test: `"${process.execPath}" scenario.ts` } }),
      )
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Найди причину падения тестов, исправь ее и проверь результат",
        model,
      })
      expect(session.contract.criteria.some((criterion) => criterion.id === "reproduction")).toBe(true)
      const result = await f.api.run(session.id)
      expect(result.status).toBe("COMPLETED")
      expect(f.api.inspect(session.id).evidence).toContainEqual(
        expect.objectContaining({
          kind: "TEST_RESULT",
          verdict: "fail",
          fingerprint: session.contract.baselineFingerprint,
        }),
      )
    } finally {
      await f.cleanup()
    }
  })
})
