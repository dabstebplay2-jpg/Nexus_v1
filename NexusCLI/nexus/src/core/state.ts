import type { AgentSession, Status } from "../domain/types"
import type { EventSink, Store } from "../domain/ports"
import { NexusError } from "../shared/errors"
import { safeJson } from "../shared/redact"

const allowed: Record<Status, Status[]> = {
  INITIALIZING: ["UNDERSTANDING", "RECOVERING"],
  UNDERSTANDING: ["PLANNING", "ACTING", "RECOVERING"],
  PLANNING: ["ACTING", "RECOVERING"],
  ACTING: ["OBSERVING", "WAITING_PERMISSION", "RECOVERING", "VERIFYING"],
  OBSERVING: ["ACTING", "VERIFYING", "RECOVERING", "UNDERSTANDING"],
  VERIFYING: ["WAITING_PERMISSION", "OBSERVING", "ACTING", "COMPLETED", "RECOVERING"],
  RECOVERING: ["UNDERSTANDING", "ACTING", "VERIFYING", "WAITING_PERMISSION"],
  WAITING_PERMISSION: ["ACTING", "VERIFYING", "RECOVERING"],
  COMPLETED: ["RECOVERING"],
  FAILED: ["RECOVERING"],
  UNKNOWN: ["RECOVERING"],
  ABORTED: ["RECOVERING"],
}
export function transition(store: Store, session: AgentSession, next: Status, emit: EventSink, reason = "") {
  if (next === session.status) return
  if (!["FAILED", "ABORTED", "UNKNOWN"].includes(next) && !allowed[session.status].includes(next))
    throw new NexusError("STATE", `Invalid transition ${session.status} → ${next}`)
  if (next === "COMPLETED" && session.decision?.outcome !== "COMPLETE")
    throw new NexusError("COMPLETION", "CompletionPolicy did not authorize completion")
  const previous = session.status
  session.status = next
  const event = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    timestamp: Date.now(),
    type: "state",
    data: { previous, next, reason },
  }
  store.transaction(() => {
    store.save(session)
    store.put("events", event)
  })
  emit(event)
}
export function publish(store: Store, session: AgentSession, emit: EventSink, type: string, data: unknown) {
  const event = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    timestamp: Date.now(),
    type,
    data: JSON.parse(safeJson(data)) as unknown,
  }
  store.put("events", event)
  emit(event)
}
