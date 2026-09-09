import type { Capability, EvidenceKind, Status } from "../../src/domain/types"
import type { RunReport } from "./run-report"

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
export type ProbeRequest = { baseUrl: string; apiKeyEnv?: string }
export type ProbeResponse = { models: string[] }
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
export type { RunReport }
