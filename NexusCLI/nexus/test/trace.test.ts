import { describe, expect, test } from "bun:test"
import path from "node:path"
import { createNexus } from "../src/composition"
import { thinkingSummary } from "../src/core/trace"
import { traceResultId, traceRootId, traceTurnId, type TraceNode } from "../src/domain/trace"
import { toolLifecycle, traceEvents, traceHistory, traceTree } from "../src/trace/projection"
import { answer, call, fixture, goalCheck, model, ScriptedProvider } from "./helpers"

/** Structure only, so a restart can be compared without depending on timestamps. */
const shape = (nodes: TraceNode[]): unknown =>
  nodes.map((node) => ({ id: node.id, type: node.type, status: node.status, children: shape(node.children) }))

describe("Trace architecture over real storage, files and a scripted LLM", () => {
  test("trace creation links root → turn → tool call → response", async () => {
    const f = await fixture((_, turn) => (turn === 1 ? call("read", { path: "add.ts" }) : answer()))
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Inspect the addition helper",
        model,
        budgets: { maxTurns: 4 },
      })
      await f.api.run(session.id)
      const inspected = f.api.inspect(session.id)
      const nodes = traceEvents(inspected.events)
      const node = (id: string) => nodes.find((event) => event.id === id)
      const action = inspected.actions.find((item) => item.tool === "read")!
      const rootId = traceRootId(session.id)
      const turnId = traceTurnId(session.id, 1)
      expect(nodes.length).toBeGreaterThan(0)
      expect(nodes.every((event) => event.traceId === session.id)).toBe(true)
      expect(nodes.every((event) => event.sessionId === session.id)).toBe(true)
      expect(node(rootId)?.type).toBe("task")
      expect(node(rootId)?.parentId).toBeUndefined()
      expect(node(turnId)?.parentId).toBe(rootId)
      expect(node(action.id)?.parentId).toBe(turnId)
      expect(node(traceResultId(action.id))?.parentId).toBe(action.id)
      const [root] = traceTree(inspected.events)
      const turnNode = root!.children.find((child) => child.id === turnId)!
      const toolCall = turnNode.children.find((child) => child.id === action.id)!
      expect(root!.id).toBe(rootId)
      expect(toolCall.type).toBe("tool_call")
      expect(toolCall.children.map((child) => child.type)).toContain("tool_result")
      expect(turnNode.children.map((child) => child.type)).toContain("context_update")
      expect(inspected.trace[0]?.id).toBe(rootId)
    } finally {
      await f.cleanup()
    }
  })
  test("tool lifecycle is REQUESTED → STARTED → COMPLETED with Input and Response", async () => {
    const f = await fixture((_, turn) => (turn === 1 ? call("read", { path: "add.ts" }) : answer()))
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Inspect the addition helper",
        model,
        budgets: { maxTurns: 4 },
      })
      await f.api.run(session.id)
      const inspected = f.api.inspect(session.id)
      const action = inspected.actions.find((item) => item.tool === "read")!
      expect(toolLifecycle(inspected.events, action.id)).toEqual(["REQUESTED", "STARTED", "COMPLETED"])
      const history = traceHistory(inspected.events, action.id)
      expect(history.map((event) => event.status)).toEqual(["pending", "running", "success"])
      expect(history.at(-1)?.input).toEqual({ path: "add.ts" })
      const response = traceEvents(inspected.events).find((event) => event.id === traceResultId(action.id))!
      expect(response.type).toBe("tool_result")
      expect(response.status).toBe("success")
      expect(String(response.output)).toContain("a - b")
    } finally {
      await f.cleanup()
    }
  })
  test("a call waiting on a human is WAITING_PERMISSION, not running", async () => {
    const f = await fixture(() => call("bash", { command: "echo hello" }), {})
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Run a command", model })
      await f.api.run(session.id)
      const inspected = f.api.inspect(session.id)
      const action = inspected.actions.find((item) => item.tool === "bash")!
      expect(toolLifecycle(inspected.events, action.id)).toEqual(["REQUESTED", "WAITING_PERMISSION", "FAILED"])
      const permission = traceEvents(inspected.events).find((event) => event.type === "permission")!
      expect(permission.parentId).toBe(action.id)
      expect(permission.status).toBe("pending")
      // The command is the Input a UI renders; the approval is still outstanding.
      expect(JSON.stringify(traceEvents(inspected.events))).toContain("echo hello")
    } finally {
      await f.cleanup()
    }
  })
  test("the timeline is rebuilt from the ledger after a restart", async () => {
    const f = await fixture((_, turn) => (turn === 1 ? call("read", { path: "add.ts" }) : answer()))
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Inspect the addition helper",
        model,
        budgets: { maxTurns: 4 },
      })
      await f.api.run(session.id)
      const before = f.api.inspect(session.id).trace
      const reopened = await createNexus({
        dataDir: path.join(f.root, "data"),
        provider: new ScriptedProvider(() => answer()),
      })
      try {
        const after = reopened.inspect(session.id).trace
        expect(shape(after)).toEqual(shape(before))
        expect(after[0]?.children.length).toBeGreaterThan(0)
        // The root was published twice: once when the run opened, once with its outcome.
        expect(after[0]?.revisions).toBeGreaterThan(1)
      } finally {
        reopened.close()
      }
    } finally {
      await f.cleanup()
    }
  })
  test("a thinking summary is advisory and cannot complete a task", async () => {
    const f = await fixture(() => answer("The task is complete. I verified everything and all tests pass."))
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Fix addition",
        model,
        goalCheck,
        budgets: { maxTurns: 2 },
      })
      const result = await f.api.run(session.id)
      expect(result.status).not.toBe("COMPLETED")
      expect(result.decision?.outcome).not.toBe("COMPLETE")
      const inspected = f.api.inspect(session.id)
      const nodes = traceEvents(inspected.events)
      const thinking = nodes.filter((event) => event.type === "thinking")
      expect(thinking.length).toBeGreaterThan(0)
      expect(thinking[0]?.summary).toContain("The task is complete")
      expect(thinking[0]?.metadata).toMatchObject({ advisory: true, influencesCompletion: false })
      // The narration is rendered, never proved: it does not become evidence, and every
      // completion node reports the policy's own outcome, which was not COMPLETE.
      expect(inspected.evidence.some((item) => String(item.actual).includes("all tests pass"))).toBe(false)
      const completions = nodes.filter((event) => event.type === "completion")
      expect(completions.length).toBeGreaterThan(0)
      expect(completions.every((event) => event.status !== "success")).toBe(true)
      expect(
        completions.every(
          (event) => (event.metadata as { authorizedBy?: string }).authorizedBy === "completion_policy",
        ),
      ).toBe(true)
      // Verification checks nest under the verification node, not under the narration.
      const verification = nodes.find((event) => event.type === "verification")!
      expect(verification.parentId).toBe(traceRootId(session.id))
      expect(nodes.some((event) => event.type === "tool_call" && event.parentId === verification.id)).toBe(true)
    } finally {
      await f.cleanup()
    }
  })
  test("thinking summaries are redacted and bounded", () => {
    expect(thinkingSummary(`Reusing key sk-${"a".repeat(40)} for the next call`)).not.toContain("sk-")
    expect(thinkingSummary("x".repeat(900)).length).toBeLessThanOrEqual(281)
    expect(thinkingSummary("  Inspecting the\n  agent loop first.  ")).toBe("Inspecting the agent loop first.")
  })
})
