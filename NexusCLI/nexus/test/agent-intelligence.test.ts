import { expect, test } from "bun:test"
import path from "node:path"
import { answer, brokenAdd, call, fixtureWith, goalCheck, model, plainScenario } from "./helpers"
import { READ_ONLY_TOOLS, classifyTask, contractMode, resolveIntent, toolAllowed } from "../src/intelligence/intent"
import { failureMemory, worstFailure } from "../src/intelligence/memory"
import { supervise } from "../src/intelligence/supervisor"
import { NEVER_AUTOMATIC, levelRules, matchPermission, parseTrustProfile } from "../src/intelligence/trust"
import type { Action } from "../src/domain/types"

const tree = { "add.ts": brokenAdd, "scenario.ts": plainScenario }
const signal = () => new AbortController().signal

const failure = (command = "bun test", error = "exit code 1") =>
  ({
    id: crypto.randomUUID(),
    sessionId: "s",
    turnId: "t",
    type: "tool",
    tool: "bash",
    implementation: "bash@1",
    target: "",
    reason: "",
    arguments: { command },
    risk: "medium",
    sideEffect: true,
    status: "FAILED",
    startedAt: 1,
    finishedAt: 2,
    error,
    evidenceIds: [],
  }) as Action
const repeat = (times: number, command?: string) => Array.from({ length: times }, () => failure(command))

// Scenario 1 -- "Покажи структуру проекта. Не меняй ничего."
test("an analysis request reads the project without shell, verification or mutation", async () => {
  const harness = await fixtureWith(tree, (_request, turn) =>
    turn === 1
      ? call("list", { path: "." })
      : turn === 2
        ? call("bash", { command: "bun test" })
        : answer("The workspace contains add.ts and scenario.ts."),
  )
  const session = await harness.api.create({
    workspace: harness.workspace,
    goal: "Покажи структуру проекта. Не меняй ничего.",
    model,
  })
  expect(session.intent?.type).toBe("ANALYSIS")
  expect(session.intent?.execution).toBe("READ_ONLY")
  expect(session.intent?.mutationAllowed).toBe(false)
  expect(session.intent?.verificationRequired).toBe(false)
  expect(session.contract.mode).toBe("answer")
  expect(session.contract.checks).toEqual([])

  await harness.api.run(session.id, signal())
  const inspected = harness.api.inspect(session.id)
  const bash = inspected.actions.filter((action) => action.tool === "bash")
  expect(inspected.actions.some((action) => action.tool === "list" && action.status === "SUCCEEDED")).toBe(true)
  expect(bash.length).toBe(1)
  expect(bash[0]!.status).toBe("FAILED")
  expect(bash[0]!.error).toContain("read-only")
  expect(inspected.evidence.some((item) => item.source === "verification")).toBe(false)
  expect(await Bun.file(path.join(harness.workspace, "add.ts")).text()).toBe(brokenAdd)
  expect(inspected.session.status).toBe("COMPLETED")
  await harness.cleanup()
})

// Scenario 2 -- "Найди ошибку. Исправь. Докажи."
test("a repair request keeps the coding contract, the shell and the evidence requirement", async () => {
  const harness = await fixtureWith(tree, (_request, turn) =>
    turn === 1
      ? call("write", { path: "add.ts", content: "export const add = (a: number, b: number) => a + b\n" })
      : turn === 2
        ? call("verify", {})
        : answer("Reproduced the failure, fixed the operator and the goal scenario now passes."),
  )
  const session = await harness.api.create({
    workspace: harness.workspace,
    goal: "Найди ошибку. Исправь. Докажи.",
    model,
    goalCheck,
  })
  expect(session.intent?.type).toBe("DEBUG")
  expect(session.intent?.execution).toBe("MUTATING")
  expect(session.intent?.verificationRequired).toBe(true)
  expect(session.intent?.workflow).toEqual(["REPRODUCE", "PLAN", "EDIT", "VERIFY"])
  expect(session.contract.mode).toBe("coding")

  await harness.api.run(session.id, signal())
  const inspected = harness.api.inspect(session.id)
  expect(inspected.actions.some((action) => action.tool === "write" && action.status === "SUCCEEDED")).toBe(true)
  expect(inspected.evidence.some((item) => item.source === "verification")).toBe(true)
  expect(await Bun.file(path.join(harness.workspace, "add.ts")).text()).toContain("a + b")
  await harness.cleanup()
})

// Scenario 3 -- "Команда падает 5 раз подряд"
test("a command that keeps failing stops the run instead of burning the budget", async () => {
  const harness = await fixtureWith(tree, () => call("bash", { command: "exit 1" }), { RUN_PROCESS: "allow" })
  const session = await harness.api.create({
    workspace: harness.workspace,
    goal: "Fix the failing command",
    model,
    goalCheck,
  })
  await harness.api.run(session.id, signal())
  const inspected = harness.api.inspect(session.id)
  const bash = inspected.actions.filter((action) => action.tool === "bash")
  // Three failures redirect the agent, five end the run: far below maxTools (120).
  expect(bash.length).toBe(5)
  expect(bash.every((action) => action.status === "FAILED")).toBe(true)
  expect(inspected.session.status).toBe("FAILED")
  expect(inspected.session.toolCount).toBeLessThan(session.budgets.maxTools)
  expect(inspected.events.some((event) => event.type === "supervisor")).toBe(true)
  await harness.cleanup()
})

test("task classification routes each workflow and keeps ambiguous goals verified", () => {
  expect(resolveIntent("Покажи структуру проекта и объясни архитектуру").workflow).toEqual([
    "UNDERSTAND",
    "READ",
    "OUTPUT",
  ])
  expect(resolveIntent("Найди ошибку и исправь").workflow).toEqual(["REPRODUCE", "PLAN", "EDIT", "VERIFY"])
  expect(resolveIntent("Переименуй модуль и упрости код").workflow).toEqual(["PLAN", "CHANGE", "TEST"])
  expect(resolveIntent("Run a security audit of the workspace").workflow).toEqual(["SCAN", "ANALYZE", "REPORT"])
  expect(resolveIntent("Add a caching layer").type).toBe("FEATURE")
  // A request that demands a change is never demoted to read-only.
  expect(classifyTask("Объясни архитектуру и добавь новый модуль").type).toBe("FEATURE")
  expect(resolveIntent("Измени так, чтобы не ломать публичный API").execution).toBe("MUTATING")
  // An explicit contract mode wins: a coding contract must stay provable.
  expect(resolveIntent("Покажи структуру. Не меняй ничего.", "coding").execution).toBe("MUTATING")
})

test("the read-only surface is exactly list, read, search, history and output", () => {
  const intent = resolveIntent("Explain the architecture. Do not change anything.")
  const mode = contractMode(intent)
  expect(mode).toBe("answer")
  expect(READ_ONLY_TOOLS).toEqual(["list", "glob", "search", "read", "retrieve", "history", "output"])
  for (const tool of ["list", "read", "search", "history", "output"]) expect(toolAllowed(intent, tool, mode)).toBe(true)
  for (const tool of ["write", "edit", "bash", "verify", "git_status"]) expect(toolAllowed(intent, tool, mode)).toBe(false)
  // Sessions created before v0.2.3 carry no intent and keep the previous surface.
  expect(toolAllowed(undefined, "bash", "coding")).toBe(true)
  expect(toolAllowed(undefined, "bash", "answer")).toBe(false)
})

test("error memory counts failures per signature and a success clears it", () => {
  const memory = failureMemory(repeat(3))
  expect(memory).toHaveLength(1)
  expect(memory[0]!.tool).toBe("bash")
  expect(memory[0]!.command).toBe("bun test")
  expect(memory[0]!.failures).toBe(3)
  expect(memory[0]!.lastError).toBe("exit code 1")
  expect(memory[0]!.recommendation).toBe("change strategy")
  expect(failureMemory(repeat(2))[0]!.recommendation).toBe("retry")
  expect(failureMemory(repeat(5))[0]!.recommendation).toBe("request user input")
  expect(worstFailure([...repeat(4), { ...failure(), status: "SUCCEEDED", error: undefined }])).toBeUndefined()
  expect(failureMemory([...repeat(2), ...repeat(3, "bun run build")])).toHaveLength(2)
})

test("the supervisor escalates on repetition and never weakens the loop guard", () => {
  const session = { id: "s" } as never
  expect(supervise({ session, actions: repeat(2), evidence: [] })).toBeUndefined()
  expect(supervise({ session, actions: repeat(3), evidence: [] })?.action).toBe("CHANGE_STRATEGY")
  expect(supervise({ session, actions: repeat(3), evidence: [] })?.source).toBe("error-memory")
  expect(supervise({ session, actions: repeat(5), evidence: [] })?.action).toBe("REQUEST_USER_INPUT")
  const guarded = supervise({
    session,
    actions: repeat(9),
    evidence: [],
    guard: { action: "STOP", reason: "Execution budget exhausted" },
  })
  expect(guarded?.action).toBe("STOP")
  expect(guarded?.guidance).toBe("STOP: Execution budget exhausted. Choose a different action; do not repeat the loop.")
})

test("trust profiles pin a command without weakening the safety floor", () => {
  const profile = {
    workspace: "/w",
    level: "normal" as const,
    rules: [
      { action: "bash", pattern: "bun *", permission: "allow" as const },
      { action: "bash", pattern: "bun run deploy", permission: "deny" as const },
    ],
  }
  const capabilities = ["RUN_TESTS" as const]
  expect(matchPermission(profile, { action: "bash", command: "bun test", capabilities })?.permission).toBe("allow")
  // Later rules win, patterns are literal, and an unmatched command says nothing.
  expect(matchPermission(profile, { action: "bash", command: "bun run deploy", capabilities })?.permission).toBe("deny")
  expect(matchPermission(profile, { action: "bash", command: "rm -rf /", capabilities })).toBeUndefined()
  expect(matchPermission(profile, { action: "write", command: "bun test", capabilities })).toBeUndefined()
  // No rule and no level may grant an escalation capability.
  for (const capability of NEVER_AUTOMATIC) {
    expect(matchPermission(profile, { action: "bash", command: "bun test", capabilities: [capability] })?.permission).toBe(
      "ask",
    )
    expect(levelRules("autonomous")[capability]).toBeUndefined()
  }
  expect(levelRules("normal")).toEqual({})
  expect(parseTrustProfile({ level: "godmode", rules: [] }, "/w")).toBeUndefined()
  expect(parseTrustProfile({ level: "safe", rules: [{ action: "bash" }] }, "/w")).toBeUndefined()
  expect(parseTrustProfile({ level: "safe", rules: [{ action: "bash", permission: "allow" }] }, "/w")?.rules).toHaveLength(
    1,
  )
})
