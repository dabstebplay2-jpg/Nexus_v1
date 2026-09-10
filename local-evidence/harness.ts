import { test } from "node:test"
import assert from "node:assert/strict"
import type { Action, AgentSession, TaskIntent } from "../src/domain/types"
import { READ_ONLY_TOOLS, classifyTask, contractMode, resolveIntent, toolAllowed } from "../src/intelligence/intent"
import { REPEAT_LIMIT, TERMINAL_LIMIT, failureMemory, worstFailure } from "../src/intelligence/memory"
import { supervise } from "../src/intelligence/supervisor"
import { NEVER_AUTOMATIC, levelRules, matchPermission, parseTrustProfile } from "../src/intelligence/trust"

const session: AgentSession = {
  id: "s",
  turns: 2,
  toolCount: 2,
  activeMs: 0,
  epochStart: 0,
  conversation: [],
  budgets: {
    maxTurns: 40,
    maxTools: 120,
    maxDurationMs: 1800000,
    maxOutputTokens: 4096,
    toolTimeoutMs: 120000,
    providerTimeoutMs: 120000,
  },
  model: { capabilities: { contextLength: 32768 } },
}

let counter = 0
const failed = (command = "bun test", error = "exit code 1"): Action => ({
  id: `a${counter++}`,
  sessionId: "s",
  turnId: "t",
  type: "tool",
  tool: "bash",
  target: "",
  arguments: { command },
  status: "FAILED",
  startedAt: 1,
  finishedAt: 2,
  error,
})
const succeeded = (command = "bun test"): Action => ({ ...failed(command), status: "SUCCEEDED", error: undefined })
const repeat = (times: number, command?: string) => Array.from({ length: times }, () => failed(command))

test("scenario 1: an explicit refusal to change files produces a read-only analysis intent", () => {
  const intent = resolveIntent("Покажи структуру проекта. Не меняй ничего.")
  assert.equal(intent.type, "ANALYSIS")
  assert.equal(intent.execution, "READ_ONLY")
  assert.equal(intent.mutationAllowed, false)
  assert.equal(intent.verificationRequired, false)
  assert.deepEqual(intent.allowedTools, READ_ONLY_TOOLS)
  assert.deepEqual(intent.workflow, ["UNDERSTAND", "READ", "OUTPUT"])
  assert.equal(contractMode(intent), "answer")
})

test("scenario 1: read-only intents offer reads and refuse mutation and shell", () => {
  const intent = resolveIntent("Покажи структуру проекта и объясни архитектуру")
  const mode = contractMode(intent)
  assert.equal(mode, "answer")
  ;["list", "read", "search", "history", "output", "glob", "retrieve"].forEach((tool) =>
    assert.equal(toolAllowed(intent, tool, mode), true, tool),
  )
  ;["write", "edit", "bash", "verify", "update_plan", "git_status"].forEach((tool) =>
    assert.equal(toolAllowed(intent, tool, mode), false, tool),
  )
})

test("scenario 2: repair work stays mutating and verified", () => {
  const intent = resolveIntent("Найди ошибку. Исправь. Докажи.")
  assert.equal(intent.type, "DEBUG")
  assert.equal(intent.execution, "MUTATING")
  assert.equal(intent.mutationAllowed, true)
  assert.equal(intent.verificationRequired, true)
  assert.deepEqual(intent.allowedTools, [])
  assert.deepEqual(intent.workflow, ["REPRODUCE", "PLAN", "EDIT", "VERIFY"])
  assert.equal(contractMode(intent), "coding")
  assert.equal(toolAllowed(intent, "bash", "coding"), true)
  assert.equal(toolAllowed(intent, "edit", "coding"), true)
})

test("workflow per task type", () => {
  assert.deepEqual(resolveIntent("Переименуй модуль и упрости код").workflow, ["PLAN", "CHANGE", "TEST"])
  assert.equal(resolveIntent("Переименуй модуль").type, "REFACTOR")
  assert.equal(resolveIntent("Add a caching layer").type, "FEATURE")
  assert.deepEqual(resolveIntent("Add a caching layer").workflow, ["PLAN", "BUILD", "TEST"])
  const audit = resolveIntent("Run a security audit of the workspace")
  assert.equal(audit.type, "AUDIT")
  assert.equal(audit.execution, "READ_ONLY")
  assert.deepEqual(audit.workflow, ["SCAN", "ANALYZE", "REPORT"])
})

test("a request that demands change outranks read-only vocabulary", () => {
  assert.equal(classifyTask("Объясни архитектуру и добавь новый модуль").type, "FEATURE")
  assert.equal(resolveIntent("Измени так, чтобы не ломать публичный API").execution, "MUTATING")
  assert.equal(resolveIntent("Сделай так, чтобы тесты проходили").execution, "MUTATING")
  assert.equal(classifyTask("Что делает этот модуль").type, "ANALYSIS")
})

test("an explicit coding mode overrides the read-only restriction", () => {
  const intent = resolveIntent("Покажи структуру. Не меняй ничего.", "coding")
  assert.equal(intent.type, "ANALYSIS")
  assert.equal(intent.execution, "MUTATING")
  assert.deepEqual(intent.allowedTools, [])
  assert.match(intent.reason, /coding contract/)
})

test("v0.2.2 behaviour is preserved for every goal used by the existing suite", () => {
  const goals = [
    "Say hello",
    "Fix addition",
    "Fix login",
    "Inspect files",
    "Inspect",
    "Inspect addition",
    "Write",
    "Run",
    "Hello",
    "Task",
    "Other",
    "Install",
    "Edit",
    "A",
    "B",
    "Найди причину падения тестов, исправь ее и проверь результат",
  ]
  goals.forEach((goal) => {
    const intent = resolveIntent(goal)
    assert.equal(contractMode(intent), "coding", goal)
    assert.equal(intent.execution, "MUTATING", goal)
    assert.deepEqual(intent.allowedTools, [], goal)
  })
})

test("sessions without an intent keep the v0.2.2 tool surface", () => {
  assert.equal(toolAllowed(undefined, "bash", "coding"), true)
  assert.equal(toolAllowed(undefined, "bash", "answer"), false)
  assert.equal(toolAllowed(undefined, "read", "answer"), false)
})

test("error memory counts failures per signature and recommends an escalation", () => {
  const three = failureMemory(repeat(3))
  assert.equal(three.length, 1)
  assert.equal(three[0]!.failures, 3)
  assert.equal(three[0]!.tool, "bash")
  assert.equal(three[0]!.command, "bun test")
  assert.equal(three[0]!.lastError, "exit code 1")
  assert.equal(three[0]!.recommendation, "change strategy")
  assert.equal(failureMemory(repeat(2))[0]!.recommendation, "retry")
  assert.equal(failureMemory(repeat(5))[0]!.recommendation, "request user input")
})

test("a success clears its signature, and distinct arguments are tracked apart", () => {
  assert.equal(worstFailure([...repeat(4), succeeded()]), undefined)
  const mixed = failureMemory([...repeat(2), ...repeat(3, "bun run build")])
  assert.equal(mixed.length, 2)
  assert.equal(mixed[0]!.command, "bun run build")
  assert.equal(mixed[0]!.failures, 3)
  assert.equal(mixed[1]!.failures, 2)
})

test("scenario 3: the supervisor changes strategy at 3 and stops at 5", () => {
  assert.equal(supervise({ session, actions: repeat(2), evidence: [] }), undefined)
  const changed = supervise({ session, actions: repeat(REPEAT_LIMIT), evidence: [] })
  assert.equal(changed?.action, "CHANGE_STRATEGY")
  assert.equal(changed?.source, "error-memory")
  assert.match(changed!.guidance, /Do not run it again/)
  assert.match(changed!.reason, /failed 3 times/)
  const stopped = supervise({ session, actions: repeat(TERMINAL_LIMIT), evidence: [] })
  assert.equal(stopped?.action, "REQUEST_USER_INPUT")
  assert.equal(stopped?.source, "error-memory")
  assert.equal(stopped?.memory?.failures, 5)
})

test("the supervisor never weakens the loop guard", () => {
  const guard = { action: "STOP", reason: "Execution budget exhausted" } as const
  const stop = supervise({ session, actions: repeat(9), evidence: [], guard })
  assert.equal(stop?.action, "STOP")
  assert.equal(stop?.source, "loop-guard")
  assert.equal(
    stop?.guidance,
    "STOP: Execution budget exhausted. Choose a different action; do not repeat the loop.",
  )
  const passthrough = supervise({
    session,
    actions: [succeeded()],
    evidence: [],
    guard: { action: "DIAGNOSE", reason: "Same tool and arguments without new information" },
  })
  assert.equal(passthrough?.action, "DIAGNOSE")
  assert.equal(passthrough?.source, "loop-guard")
  assert.equal(
    passthrough?.guidance,
    "DIAGNOSE: Same tool and arguments without new information. Choose a different action; do not repeat the loop.",
  )
})

test("trust profiles resolve a pinned command without asking", () => {
  const profile = {
    workspace: "/w",
    level: "normal" as const,
    rules: [{ action: "bash", pattern: "bun test", permission: "allow" as const }],
  }
  const request = { action: "bash", command: "bun test", capabilities: ["RUN_TESTS" as const] }
  assert.equal(matchPermission(profile, request)?.permission, "allow")
  assert.equal(matchPermission(profile, { ...request, command: "bun  test" })?.permission, "allow")
  assert.equal(matchPermission(profile, { ...request, command: "rm -rf /" }), undefined)
  assert.equal(matchPermission(profile, { ...request, action: "write" }), undefined)
  assert.equal(matchPermission(undefined, request), undefined)
})

test("patterns are literal with an optional trailing wildcard, and later rules win", () => {
  const profile = {
    workspace: "/w",
    level: "normal" as const,
    rules: [
      { action: "bash", pattern: "bun *", permission: "allow" as const },
      { action: "bash", pattern: "bun run deploy", permission: "deny" as const },
    ],
  }
  const capabilities = ["RUN_PROCESS" as const]
  assert.equal(matchPermission(profile, { action: "bash", command: "bun run build", capabilities })?.permission, "allow")
  assert.equal(matchPermission(profile, { action: "bash", command: "bun run deploy", capabilities })?.permission, "deny")
  assert.equal(matchPermission(profile, { action: "bash", command: "bun.*", capabilities }), undefined)
})

test("no rule and no level can grant a NEVER_AUTOMATIC capability", () => {
  const profile = {
    workspace: "/w",
    level: "autonomous" as const,
    rules: [{ action: "bash", permission: "allow" as const }],
  }
  NEVER_AUTOMATIC.forEach((capability) => {
    assert.equal(matchPermission(profile, { action: "bash", command: "x", capabilities: [capability] })?.permission, "ask")
    assert.equal(levelRules("autonomous")[capability], undefined)
    assert.equal(levelRules("trusted-workspace")[capability], undefined)
  })
  assert.deepEqual(levelRules("normal"), {})
})

test("profile documents are validated structurally", () => {
  assert.equal(parseTrustProfile(undefined, "/w"), undefined)
  assert.equal(parseTrustProfile({ level: "godmode", rules: [] }, "/w"), undefined)
  assert.equal(parseTrustProfile({ level: "safe", rules: [{ action: "bash" }] }, "/w"), undefined)
  const parsed = parseTrustProfile({ level: "safe", rules: [{ action: "bash", permission: "allow" }] }, "/w")
  assert.equal(parsed?.level, "safe")
  assert.equal(parsed?.workspace, "/w")
  assert.equal(parsed?.rules.length, 1)
})

test("the resolved intent is assignable to the domain type", () => {
  const intent: TaskIntent = resolveIntent("Explain the architecture")
  assert.equal(intent.confidence, "high")
})
