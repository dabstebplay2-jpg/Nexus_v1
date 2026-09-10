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
/**
 * Trust anchors, pinned.
 *
 * Two pattern classes, because they need opposite rules. Harness and configuration files decide
 * *how* a check runs, so introducing one that did not exist is as dangerous as editing one.
 * Existing test cases must not be edited under a check, but adding new regression tests is the
 * work being asked for, so a new file matching an `extensible` pattern is not a violation.
 */
export type TrustPatterns = { exclusive: string[]; extensible: string[] }
export type TrustManifest = {
  version: number
  generatedAt: string
  contractRevision: number
  patterns: TrustPatterns
  /** Anchor path -> sha256 at the moment trust was established. */
  protected: Record<string, string>
  /** Well-known harness files absent when trust was established. Informational; the guard derives its own. */
  absent: string[]
  /** Files named directly by a trusted check's argv. */
  runners: string[]
}
export type TrustViolationKind = "modified" | "deleted" | "introduced"
export type TrustViolation = { path: string; kind: TrustViolationKind; reason: string }
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
  /** Pinned trust anchors. Absent on sessions created before Phase 0; protectedFiles still applies. */
  trustManifest?: TrustManifest
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
/**
 * Context layers, in priority order.
 *
 * The prompt is assembled from these, not from "the whole transcript". L0 is what makes a run
 * sound and is never dropped. L4 is durable in storage and is never resent: it is reachable only
 * through `history` and `output(actionId)`, which is what keeps a long session from rotting the
 * window it has left.
 */
export type ContextLayer = "L0_CRITICAL" | "L1_WORKING" | "L2_TASK_MEMORY" | "L3_PROJECT" | "L4_ARCHIVE"
/** How aggressively low-priority context is given up. Derived from window utilisation, never set by a model. */
export type CompactionStage = "normal" | "soft" | "hard" | "emergency"
export type ContextCategory = {
  key: string
  layer: ContextLayer
  tokens: number
  /** Fraction of the admitted prompt. Zero for excluded categories. */
  share: number
  pinned: boolean
  included: boolean
}
/**
 * What the Context Engine did, and why. Recorded on the session and emitted as `context_report`.
 *
 * Numbers and category names only: no file contents, no message text, nothing redactable. That is
 * deliberate, because this record is meant to reach a UI panel and a log without becoming a new
 * way to leak workspace data.
 */
export type ContextReport = {
  epoch: number
  window: number
  limit: number
  output: number
  used: number
  free: number
  utilisation: number
  stage: CompactionStage
  mode: "normal" | "prepare" | "compress"
  /** Detail scale the assembled prompt was rendered at; 1 is full detail. */
  detail: number
  categories: ContextCategory[]
  included: string[]
  excluded: string[]
  history: { messages: number; live: number; archived: number; summaries: number }
  compression: { beforeTokens: number; afterTokens: number; saved: number }
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
  context?: {
    pressure: number
    failures: number
    inputTokens?: number
    outputTokens?: number
    mode?: "normal" | "prepare" | "compress"
    stage?: CompactionStage
    report?: ContextReport
  }
  model: ModelConfig
  budgets: Budgets
  turns: number
  toolCount: number
  activeMs: number
  contract: Contract
  intent?: TaskIntent
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
