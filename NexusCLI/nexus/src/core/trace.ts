import type { EventSink, Store } from "../domain/ports"
import type { AgentSession } from "../domain/types"
import {
  toolPhaseStatus,
  traceDiffId,
  traceIdFor,
  tracePermissionId,
  traceResultId,
  type ToolPhase,
  type TraceEvent,
  type TraceNodeInput,
} from "../domain/trace"
import { bound, redact, safeJson } from "../shared/redact"
import { publish } from "./state"

/** Trace payloads exist to be read by a human, so they are always redacted and bounded hard. */
const limits = { title: 200, summary: 600, payload: 2000 }

export type ToolTraceInput = {
  /** The action id: a tool_call node and its Action are the same event, so they share identity. */
  actionId: string
  parentId: string
  tool: string
  title: string
  input: unknown
  metadata?: Record<string, unknown>
}

/** A handle over one tool call. The executor drives it; nothing reads it back. */
export type ToolTrace = {
  readonly id: string
  /** Phases recorded so far, in order. A UI reads the last one; a test reads the sequence. */
  readonly phases: readonly ToolPhase[]
  requested: () => void
  waitingPermission: (reason: string) => void
  permissionResolved: (approved: boolean, reason?: string) => void
  started: () => void
  streaming: (output: string) => void
  completed: (output: unknown, metadata?: Record<string, unknown>) => void
  failed: (summary: string, output?: unknown, metadata?: Record<string, unknown>) => void
  diff: (title: string, metadata: Record<string, unknown>) => void
}

/**
 * The trace recorder.
 *
 * It owns no transport and no table. Every node is written with `publish()`, the single event
 * publisher the core already had, so a trace event lands in the same SQLite `events` projection,
 * the same append-only `session_events` ledger and the same EventSink the SSE endpoint is already
 * subscribed to. There is no second path to keep in sync.
 */
export class TraceRecorder {
  constructor(
    private readonly store: Store,
    private readonly emit: EventSink,
  ) {}
  /** Publish one node. Re-publishing the same id records a delta, never a mutation. */
  node(session: AgentSession, input: TraceNodeInput): TraceEvent {
    const event: TraceEvent = {
      id: input.id,
      sessionId: session.id,
      traceId: traceIdFor(session.id),
      ...(input.parentId ? { parentId: input.parentId } : {}),
      timestamp: Date.now(),
      type: input.type,
      status: input.status,
      title: safeText(input.title, limits.title),
      ...(input.summary === undefined ? {} : { summary: safeText(input.summary, limits.summary) }),
      ...(input.input === undefined ? {} : { input: safePayload(input.input) }),
      ...(input.output === undefined ? {} : { output: safePayload(input.output) }),
      ...(input.metadata === undefined ? {} : { metadata: safePayload(input.metadata) }),
    }
    publish(this.store, session, this.emit, input.type, event)
    return event
  }
  /**
   * One tool call: the Input on the call node, the Response as its child, and every phase in
   * between. Created before the call can be denied, so a rejected tool still appears.
   */
  tool(session: AgentSession, input: ToolTraceInput): ToolTrace {
    const phases: ToolPhase[] = []
    const asked = { permission: false }
    const phase = (next: ToolPhase, extra: Partial<TraceNodeInput> = {}) => {
      phases.push(next)
      this.node(session, {
        id: input.actionId,
        parentId: input.parentId,
        type: "tool_call",
        status: toolPhaseStatus[next],
        title: input.title,
        input: input.input,
        ...extra,
        metadata: {
          tool: input.tool,
          phase: next,
          phases: [...phases],
          ...input.metadata,
          ...(extra.metadata ?? {}),
        },
      })
    }
    const result = (status: "success" | "failed", title: string, extra: Partial<TraceNodeInput>) =>
      this.node(session, {
        id: traceResultId(input.actionId),
        parentId: input.actionId,
        type: "tool_result",
        status,
        title,
        ...extra,
      })
    return {
      id: input.actionId,
      phases,
      requested: () => phase("REQUESTED"),
      waitingPermission: (reason) => {
        asked.permission = true
        phase("WAITING_PERMISSION", { summary: reason })
        this.node(session, {
          id: tracePermissionId(input.actionId),
          parentId: input.actionId,
          type: "permission",
          status: "pending",
          title: `Approval required: ${input.tool}`,
          summary: reason,
          metadata: { tool: input.tool, decidedBy: "permission_engine" },
        })
      },
      // Only reported when a human was actually asked; a rule that allowed the call silently
      // stays silent, so an approval in the timeline always means someone approved it.
      permissionResolved: (approved, reason) => {
        if (!asked.permission) return
        this.node(session, {
          id: tracePermissionId(input.actionId),
          parentId: input.actionId,
          type: "permission",
          status: approved ? "success" : "failed",
          title: `${approved ? "Approved" : "Declined"}: ${input.tool}`,
          ...(reason === undefined ? {} : { summary: reason }),
          metadata: { tool: input.tool, approved, decidedBy: "permission_engine" },
        })
      },
      started: () => phase("STARTED"),
      streaming: (output) => phase("STREAMING_OUTPUT", { metadata: { outputChars: output.length } }),
      completed: (output, metadata) => {
        phase("COMPLETED", metadata === undefined ? {} : { metadata })
        result("success", `${input.tool} response`, {
          output,
          ...(metadata === undefined ? {} : { metadata }),
        })
      },
      failed: (summary, output, metadata) => {
        phase("FAILED", { summary, ...(metadata === undefined ? {} : { metadata }) })
        result("failed", `${input.tool} failed`, {
          summary,
          ...(output === undefined ? {} : { output }),
          ...(metadata === undefined ? {} : { metadata }),
        })
      },
      diff: (title, metadata) => {
        this.node(session, {
          id: traceDiffId(input.actionId),
          parentId: input.actionId,
          type: "diff",
          status: "success",
          title,
          metadata,
        })
      },
    }
  }
}

/**
 * The thinking summary layer.
 *
 * Deliberately not a chain of thought. The only input is text the model already sent to the user,
 * which is stored in the transcript either way; this trims it to its first sentences, redacts it
 * and marks it advisory. No hidden reasoning is requested, recorded or read back, and no decision
 * consults the result.
 */
export function thinkingSummary(narration: string, limit = 280) {
  const flat = redact(narration).replace(/\s+/g, " ").trim()
  if (flat.length <= limit) return flat
  const sentence = flat.slice(0, limit).lastIndexOf(". ")
  return sentence > 60 ? flat.slice(0, sentence + 1) : `${flat.slice(0, limit).trimEnd()}…`
}

function safeText(value: string, limit: number) {
  return bound(redact(value), limit).text
}

/**
 * Payloads are redacted, then bounded. One that does not fit becomes an explicit preview rather
 * than truncated JSON, so a client never has to parse half an object to render a row.
 */
function safePayload(value: unknown): unknown {
  if (typeof value === "string") return safeText(value, limits.payload)
  const serialized = bound(safeJson(value), limits.payload)
  return serialized.truncated
    ? { truncated: true, totalChars: serialized.totalChars, preview: serialized.text }
    : (JSON.parse(safeJson(value)) as unknown)
}
