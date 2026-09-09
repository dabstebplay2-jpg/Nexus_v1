import type { Capability, Decision, EvidenceKind, Status, Verdict } from "../../src/domain/types"

/**
 * The wire contract between the Nexus API server and its clients.
 *
 * Types only: the web interface imports this file directly, so it must stay free of runtime
 * code and of anything that needs the Bun runtime. Everything a client can learn about a run
 * comes from here, and nothing here carries a verdict the completion policy did not produce.
 */
export type RunMode = "fast" | "balanced" | "deep"

export type ProjectSettings = {
  /** Preset the model configuration came from, so the UI can show it selected. */
  presetId: string
  baseUrl: string
  model: string
  apiKeyEnv: string
  contextLength: number
  mode: RunMode
  /** Run trusted project checks without asking each time; mirrors the CLI --allow-checks flag. */
  allowChecks: boolean
  /** Argv of the user's own scenario check. A stronger proof than the default contract. */
  goalCommand?: string[]
}
/** A settings patch. goalCommand accepts null to clear it. */
export type ProjectPatch = Partial<Omit<ProjectSettings, "goalCommand">> & {
  name?: string
  goalCommand?: string[] | null
}
export type CheckSummary = { id: string; description: string; kind: EvidenceKind; argv: string[] }
export type ProjectTask = {
  runId?: string
  sessionId: string
  goal: string
  status: Status
  createdAt: number
  updatedAt: number
}
export type Project = {
  id: string
  name: string
  path: string
  createdAt: number
  settings: ProjectSettings
  /** False when the registered directory has been moved or deleted since it was added. */
  available: boolean
}
/** A project plus everything that needs the workspace or the ledger to answer. */
export type ProjectDetail = Project & {
  kind: string
  packageManager?: string
  checks: CheckSummary[]
  branch?: string
  /** Task history for this workspace, newest first. Read from the core ledger, not a second store. */
  tasks: ProjectTask[]
  activeRunId?: string
}
export type RunSummary = {
  id: string
  projectId: string
  sessionId: string
  goal: string
  workspace: string
  status: Status
  mode: RunMode
  model: string
  startedAt: number
  finishedAt?: number
  /** Set when the run itself threw, which is not the same as a session that failed its contract. */
  error?: string
  running: boolean
  pendingPermission?: PermissionPrompt
}
export type PermissionPrompt = {
  requestId: string
  tool: string
  capabilities: Capability[]
  reason: string
  arguments: unknown
}
/** One event from the core, numbered so a reconnecting client can replay without gaps. */
export type StreamEvent = {
  cursor: number
  id: string
  type: string
  timestamp: number
  data: unknown
}
export type ModelPreset = {
  id: string
  label: string
  baseUrl: string
  apiKeyEnv: string
  suggestedModels: string[]
  requiresKey: boolean
  /** True only when the API key environment variable is set on the server. Never the key itself. */
  keyConfigured: boolean
  contextLength: number
  /** Honest note about how this provider is reached, including compatibility caveats. */
  note: string
}
export type ModeDescriptor = {
  id: RunMode
  label: string
  description: string
  maxTurns: number
  maxTools: number
  maxOutputTokens: number
  maxDurationMs: number
}
export type ModelsResponse = { presets: ModelPreset[]; modes: ModeDescriptor[] }
export type ProbeRequest = { baseUrl: string; apiKeyEnv?: string; presetId?: string; model?: string }
export type ProbeResponse = {
  ok: boolean
  stage: "config" | "connect" | "discovery" | "model" | "chat" | "ready"
  provider: string
  baseUrl: string
  statusCode?: number
  message: string
  suggestion: string
  models: string[]
  discovery: "available" | "unsupported" | "failed"
  keyConfigured: boolean
}
export type HealthResponse = {
  name: string
  version: string
  dataDir: string
  bun: string
  executables: Record<string, string | null>
}
export type CreateProjectRequest = { path: string; name?: string }
export type CreateRunRequest = {
  projectId: string
  goal: string
  mode?: RunMode
  model?: string
  /** Informational mode: the contract only requires a delivered answer, not code changes. */
  answerOnly?: boolean
}
export type PromptRequest = { text: string; delivery?: "STEER" | "QUEUE" }
export type PermissionRequest = { requestId: string; approved: boolean }
export type NoteRequest = { note: string }
export type ResolveActionRequest = { actionId: string; outcome: "VERIFIED" | "FAILED"; note: string }
export type DiffResponse = {
  patches: { actionId?: string; patch: string }[]
  processes: { actionId: string; tool: string; status: string; attribution: string }[]
}
export type ErrorResponse = { error: string; code?: string }
export type ReportPlanStep = {
  id: string
  description: string
  state: "PENDING" | "ACTIVE" | "DONE" | "BLOCKED"
  note: string
}
export type ReportFileChange = { path?: string; added: number; removed: number; patch: string }
export type ReportProcess = { actionId: string; tool: string; status: string; attribution: string }
export type ReportCheck = {
  checkId: string
  verdict: Verdict
  argv: string
  exitCode?: number
  unknownReason?: string
  /** Files this check mutated while running, which is why its exit code cannot be attributed. */
  sourceChanges: string[]
  evidenceId: string
}
export type ReportCriterion = {
  id: string
  description: string
  kind: EvidenceKind
  expectedVerdict: Verdict
  baseline: boolean
  met: boolean
  verdict?: Verdict
  evidenceId?: string
  /** The completion policy listed this criterion as the reason the run is not complete. */
  unsatisfied: boolean
}
/** What a human can do next. Derived once so no client has to guess the way out of UNKNOWN. */
export type ReportAffordance = "inspect" | "trust-checks" | "assert-goal" | "resolve-action" | "resume"
export type RunReport = {
  sessionId: string
  goal: string
  status: Status
  project: string
  model: string
  branch: string
  turns: number
  toolCount: number
  createdAt: number
  updatedAt: number
  decision?: Decision
  plan: ReportPlanStep[]
  changes: { files: ReportFileChange[]; processes: ReportProcess[] }
  verification: ReportCheck[]
  evidence: ReportCriterion[]
  affordances: ReportAffordance[]
  /** The model's closing message. Only trustworthy once the completion policy authorized COMPLETED. */
  proposal?: { verified: boolean; text: string }
}
