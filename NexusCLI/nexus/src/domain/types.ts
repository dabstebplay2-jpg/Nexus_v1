export type Status =
  | "INITIALIZING"
  | "UNDERSTANDING"
  | "PLANNING"
  | "ACTING"
  | "OBSERVING"
  | "VERIFYING"
  | "RECOVERING"
  | "WAITING_PERMISSION"
  | "WAITING_CONTEXT"
  | "COMPLETED"
  | "FAILED"
  | "UNKNOWN"
  | "ABORTED"
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
export type Risk = "low" | "medium" | "high" | "critical"
export type EvidenceKind =
  | "TEST_RESULT"
  | "BUILD_RESULT"
  | "LINT_RESULT"
  | "TYPECHECK_RESULT"
  | "COMMAND_RESULT"
  | "FILE_ASSERTION"
  | "FILE_CHANGE"
  | "GIT_DIFF"
  | "RUNTIME_CHECK"
  | "HTTP_CHECK"
  | "PROCESS_CHECK"
  | "MANUAL_ASSERTION"
  | "GOAL_ASSERTION"
export type Verdict = "pass" | "fail" | "unknown"
export type ToolCall = { id: string; name: string; arguments: unknown }
export type Message = {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
}
export type ModelConfig = {
  provider: "openai-compatible"
  baseUrl: string
  model: string
  apiKeyEnv: string
  capabilities: {
    toolCalling: boolean
    streaming: boolean
    structuredOutput: boolean
    reasoning: boolean
    vision: boolean
    parallelTools: boolean
    contextLength: number
  }
}
export type Budgets = {
  maxTurns: number
  maxTools: number
  maxDurationMs: number
  maxOutputTokens: number
  toolTimeoutMs: number
  providerTimeoutMs: number
}
export type PlanStep = {
  id: string
  description: string
  state: "PENDING" | "ACTIVE" | "DONE" | "BLOCKED"
  dependencies: string[]
  attempts: number
  evidence: string[]
  note: string
}
export type Check = { id: string; description: string; kind: EvidenceKind; argv: string[]; timeoutMs: number; expectedStdout?: string }
export type Criterion = {
  id: string
  description: string
  checkId?: string
  kind: EvidenceKind
  required: boolean
  expectedVerdict?: Verdict
  baseline?: boolean
}
export type Contract = {
  revision: number
  goal: string
  mode: "coding" | "answer"
  criteria: Criterion[]
  checks: Check[]
  protectedFiles?: Record<string, string>
  baselineFingerprint?: string
  /** Paths and directory prefixes a trusted check was observed to generate. Learned, never hardcoded. */
  generatedPaths?: string[]
}
export type Project = { kind: string; packageManager?: string; roots: string[]; checks: Check[] }
export type GitBaseline = {
  branch: string
  head: string
  status: string
  staged: string
  unstaged: string
  untracked: string
  available: boolean
}
export type AgentSession = {
  id: string
  workspace: string
  goal: string
  status: Status
  version: number
  createdAt: number
  updatedAt: number
  conversation: Message[]
  plan: PlanStep[]
  epoch: number
  epochStart: number
  summary: string
  context?: { pressure: number; failures: number; inputTokens?: number; outputTokens?: number; mode?: "normal" | "prepare" | "compress" }
  model: ModelConfig
  budgets: Budgets
  turns: number
  toolCount: number
  activeMs: number
  contract: Contract
  project: Project
  baseline: GitBaseline
  errors: string[]
  decision?: Decision
  ledgerId: string
  evidenceStoreId: string
  queuedPrompts: string[]
  steerMessages: string[]
}
export type Action = {
  id: string
  sessionId: string
  turnId: string
  callId?: string
  type: string
  tool: string
  implementation: string
  target: string
  reason: string
  arguments: unknown
  risk: Risk
  sideEffect: boolean
  status: "PLANNED" | "STARTED" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "VERIFIED"
  startedAt: number
  finishedAt?: number
  beforeHash?: string
  afterHash?: string
  result?: unknown
  error?: string
  evidenceIds: string[]
}
export type Evidence = {
  id: string
  sessionId: string
  actionId?: string
  source: "tool" | "verification" | "user" | "core"
  timestamp: number
  kind: EvidenceKind
  command: string
  expected: unknown
  actual: unknown
  verdict: Verdict
  metadata: Record<string, unknown>
  rawOutput?: string
  fingerprint?: string
  contractRevision: number
}
export type Decision = {
  outcome: "COMPLETE" | "INCOMPLETE" | "BLOCKED" | "NEEDS_VERIFICATION" | "NEEDS_USER_INPUT" | "UNKNOWN"
  reason: string
  missing: string[]
}
export type Input = { id: string; sessionId: string; text: string; delivery: "STEER" | "QUEUE"; promoted: boolean }
export type Event = { id: string; sessionId: string; timestamp: number; type: string; data: unknown }
export type Epoch = {
  id: string
  sessionId: string
  number: number
  baseline: string
  snapshot?: string
  summary: string
  cutoff: number
}
export type VerificationRun = {
  id: string
  sessionId: string
  startedAt: number
  finishedAt?: number
  evidenceIds: string[]
  fingerprint: string
}
export type Turn = {
  id: string
  sessionId: string
  number: number
  status: "STARTED" | "SUCCEEDED" | "FAILED" | "UNKNOWN"
  contextChars: number
  contextTokens: number
  model: string
  error?: string
}
export type TableRecords = {
  actions: Action
  evidence: Evidence
  queued_inputs: Input
  events: Event
  context_epochs: Epoch
  verification_runs: VerificationRun
  turns: Turn
}
