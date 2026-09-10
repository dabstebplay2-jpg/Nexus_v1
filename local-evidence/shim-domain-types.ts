// LOCAL HARNESS SHIM -- not pushed. Reproduces the subset of src/domain/types.ts the
// intelligence layer consumes, plus the additive TaskIntent types, so the new pure modules
// can be typechecked and executed outside Bun.
export type Capability =
  | "READ"
  | "WRITE_PROJECT"
  | "WRITE_OUTSIDE_PROJECT"
  | "RUN_PROCESS"
  | "RUN_TESTS"
  | "NETWORK"
  | "INSTALL_PACKAGE"
  | "DELETE"
  | "GIT_MUTATE"
  | "SECRET_ACCESS"
  | "SYSTEM_MUTATION"
export type TaskType = "ANALYSIS" | "DEBUG" | "FEATURE" | "REFACTOR" | "AUDIT"
export type ExecutionMode = "READ_ONLY" | "MUTATING"
export type TaskIntent = {
  type: TaskType
  execution: ExecutionMode
  mutationAllowed: boolean
  verificationRequired: boolean
  allowedTools: string[]
  workflow: string[]
  confidence: "high" | "low"
  reason: string
}
export type Contract = { revision: number; goal: string; mode: "coding" | "answer" }
export type Budgets = {
  maxTurns: number
  maxTools: number
  maxDurationMs: number
  maxOutputTokens: number
  toolTimeoutMs: number
  providerTimeoutMs: number
}
export type Message = { role: "system" | "user" | "assistant" | "tool"; content: string }
export type AgentSession = {
  id: string
  turns: number
  toolCount: number
  activeMs: number
  epochStart: number
  conversation: Message[]
  budgets: Budgets
  model: { capabilities: { contextLength: number } }
  intent?: TaskIntent
}
export type Action = {
  id: string
  sessionId: string
  turnId: string
  type: string
  tool: string
  target: string
  arguments: unknown
  status: "PLANNED" | "STARTED" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "VERIFIED"
  startedAt: number
  finishedAt?: number
  afterHash?: string
  result?: unknown
  error?: string
}
export type Evidence = { id: string; kind: string; verdict: "pass" | "fail" | "unknown"; actual: unknown }
