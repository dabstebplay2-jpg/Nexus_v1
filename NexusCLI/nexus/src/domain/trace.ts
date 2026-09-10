/**
 * Trace events: the timeline contract.
 *
 * The core already produced nearly everything a timeline needs — actions, evidence, turns and
 * state transitions are all durable. The problem was shape: each fact was published as a flat
 * `Event` with an ad-hoc `data` payload, so every client had to re-derive the structure of a run
 * from event types it happened to recognise. That is where information was lost between
 * Core → Events → UI.
 *
 * A `TraceEvent` makes the structure explicit: an identity, a parent, a lifecycle status and,
 * where they exist, the input that was sent and the output that came back.
 *
 * It is a projection of work that already happened. Nothing in this file is read by the
 * completion policy, the permission engine, the loop guard or the supervisor, so a trace event
 * can never make a run look finished; deleting every node would leave behaviour identical.
 */

/** Node kinds. `task` and `turn` are the scope nodes the rest of the tree hangs from. */
export const traceEventTypes = [
  "task",
  "turn",
  "thinking",
  "plan",
  "tool_call",
  "tool_result",
  "observation",
  "verification",
  "diff",
  "context_update",
  "permission",
  "completion",
] as const
export type TraceEventType = (typeof traceEventTypes)[number]

export const traceStatuses = ["pending", "running", "success", "failed"] as const
export type TraceStatus = (typeof traceStatuses)[number]

/**
 * The tool lifecycle.
 *
 * `ACTING → tool → SUCCESS` could not distinguish "waiting for a human" from "working", which is
 * exactly what someone watching a run needs to see. Phases are recorded in the tool_call node's
 * metadata, and the node's `status` is derived from the phase rather than set independently.
 */
export const toolPhases = [
  "REQUESTED",
  "WAITING_PERMISSION",
  "STARTED",
  "STREAMING_OUTPUT",
  "COMPLETED",
  "FAILED",
] as const
export type ToolPhase = (typeof toolPhases)[number]

export const toolPhaseStatus: Record<ToolPhase, TraceStatus> = {
  REQUESTED: "pending",
  WAITING_PERMISSION: "pending",
  STARTED: "running",
  STREAMING_OUTPUT: "running",
  COMPLETED: "success",
  FAILED: "failed",
}

export type TraceEvent = {
  id: string
  sessionId: string
  traceId: string
  parentId?: string
  timestamp: number
  type: TraceEventType
  status: TraceStatus
  title: string
  summary?: string
  input?: unknown
  output?: unknown
  metadata?: unknown
}

/** What a caller supplies. Identity, redaction and bounding are applied by the recorder. */
export type TraceNodeInput = {
  id: string
  parentId?: string
  type: TraceEventType
  status: TraceStatus
  title: string
  summary?: string
  input?: unknown
  output?: unknown
  metadata?: Record<string, unknown>
}

/** A folded node: the latest envelope for an id, its children, and how often it changed. */
export type TraceNode = TraceEvent & { children: TraceNode[]; revisions: number }

const eventTypes: ReadonlySet<string> = new Set(traceEventTypes)
const statuses: ReadonlySet<string> = new Set(traceStatuses)

/**
 * Trace envelopes share the ledger with the older flat events, and two type names (`permission`,
 * `completion`) now exist in both worlds. `traceId` is the discriminator, so a client can tell a
 * trace envelope from a legacy payload without a version flag and without a migration.
 */
export function isTraceEvent(value: unknown): value is TraceEvent {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<TraceEvent>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.traceId === "string" &&
    typeof candidate.timestamp === "number" &&
    typeof candidate.title === "string" &&
    typeof candidate.type === "string" &&
    eventTypes.has(candidate.type) &&
    typeof candidate.status === "string" &&
    statuses.has(candidate.status)
  )
}

/**
 * Identities are derived, never random.
 *
 * A phase change re-publishes the same node id, so the ledger stays append-only while the tree
 * stays small. And because ids come from the session, the turn number and the action id, the same
 * tree is rebuilt after a restart without storing one extra row.
 */
export const traceIdFor = (sessionId: string) => sessionId
export const traceRootId = (sessionId: string) => `${sessionId}:root`
export const traceTurnId = (sessionId: string, turn: number) => `${sessionId}:turn:${turn}`
export const traceResultId = (actionId: string) => `${actionId}:result`
export const tracePermissionId = (actionId: string) => `${actionId}:permission`
export const traceDiffId = (actionId: string) => `${actionId}:diff`
