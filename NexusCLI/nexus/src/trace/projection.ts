import type { Event } from "../domain/types"
import { isTraceEvent, type TraceEvent, type TraceNode } from "../domain/trace"

/**
 * Rebuilding the timeline from the ledger.
 *
 * Trace nodes are published as append-only deltas: `REQUESTED`, `STARTED` and `COMPLETED` are
 * three ledger events carrying one node id. Folding is therefore "last envelope wins, in
 * first-seen order", which is what makes the tree survive a process restart — nothing is held in
 * memory, and `store.list("events", sessionId)` is the whole input.
 *
 * Pure functions over plain data, with no Bun or storage imports, so the same code can run in the
 * server, in a test, or in the web client against replayed SSE events.
 */

/** The current state of every node, in the order the nodes first appeared. */
export function traceEvents(events: readonly Event[]): TraceEvent[] {
  const latest = new Map<string, TraceEvent>()
  for (const event of events) {
    // A Map keeps first-insertion order, so overwriting a node does not reorder the timeline.
    if (isTraceEvent(event.data)) latest.set(event.data.id, event.data)
  }
  return [...latest.values()]
}

/** Every recorded envelope for one node, oldest first. Tool lifecycles are read from here. */
export function traceHistory(events: readonly Event[], nodeId: string): TraceEvent[] {
  return events
    .map((event) => event.data)
    .filter(isTraceEvent)
    .filter((event) => event.id === nodeId)
}

/** The phases a tool_call passed through, in order. */
export function toolLifecycle(events: readonly Event[], nodeId: string): string[] {
  const phases: string[] = []
  for (const event of traceHistory(events, nodeId)) {
    const phase = phaseOf(event)
    if (phase && phase !== phases[phases.length - 1]) phases.push(phase)
  }
  return phases
}

/**
 * The folded tree. A node whose parent is missing becomes a root, so a partial or truncated
 * ledger still renders instead of dropping subtrees.
 */
export function traceTree(events: readonly Event[]): TraceNode[] {
  const revisions = new Map<string, number>()
  for (const event of events) {
    if (isTraceEvent(event.data)) revisions.set(event.data.id, (revisions.get(event.data.id) ?? 0) + 1)
  }
  const nodes = new Map<string, TraceNode>(
    traceEvents(events).map((event) => [
      event.id,
      { ...event, children: [], revisions: revisions.get(event.id) ?? 1 },
    ]),
  )
  const roots: TraceNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function phaseOf(event: TraceEvent) {
  if (!event.metadata || typeof event.metadata !== "object") return undefined
  const phase = (event.metadata as { phase?: unknown }).phase
  return typeof phase === "string" ? phase : undefined
}
