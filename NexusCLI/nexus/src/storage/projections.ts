import type { LedgerEntry, Range, Store } from "../domain/ports"
import type { Action, AgentSession, Evidence, Message } from "../domain/types"

/**
 * Read models over the append-only ledger.
 *
 * The typed tables are projections of `session_events`: the ledger fixes the order, the tables
 * hold the latest state of each record. These views are the supported way to read a long session
 * without loading it whole — every one of them is bounded or cursor-driven.
 */
export type SessionView = {
  session: AgentSession
  counts: { messages: number; actions: number; evidence: number; turns: number; events: number }
  ledgerHead: number
}
export type EvidenceView = { rows: Evidence[]; total: number; offset: number; more: boolean }
export type TimelineEntry = LedgerEntry & { payload?: unknown }
export type TimelineView = { entries: TimelineEntry[]; cursor: number; more: boolean }

/** Session header plus counters. Never loads the transcript. */
export function sessionView(store: Store, id: string): SessionView {
  return {
    session: store.header(id),
    counts: {
      messages: store.messageCount(id),
      actions: store.count("actions", id),
      evidence: store.count("evidence", id),
      turns: store.count("turns", id),
      events: store.count("events", id),
    },
    ledgerHead: store.ledger(id, { limit: 1, afterSeq: 0 }).at(0)?.seq ?? 0,
  }
}

/** Paginated evidence, oldest first. The evidence ledger is the proof record, so order is stable. */
export function evidenceView(store: Store, id: string, range: Range): EvidenceView {
  const offset = range.offset ?? 0
  const total = store.count("evidence", id)
  return {
    rows: store.page("evidence", id, { offset, limit: range.limit }),
    total,
    offset,
    more: offset + range.limit < total,
  }
}

/** Paginated transcript. Callers that stream a long session should page instead of loading it. */
export function transcriptView(
  store: Store,
  id: string,
  range: Range,
): { rows: Message[]; total: number; more: boolean } {
  const offset = range.offset ?? 0
  const total = store.messageCount(id)
  return { rows: store.messages(id, { offset, limit: range.limit }), total, more: offset + range.limit < total }
}

/**
 * Resumable ordered stream of everything that happened, newest cursor last.
 *
 * `cursor` is a durable sequence number: persist it, restart, pass it back, and the stream
 * continues without gaps or repeats. `resolve` hydrates payloads only for the kinds a caller asks
 * for, so a timeline scan does not deserialize the whole session.
 */
export function timelineView(
  store: Store,
  id: string,
  cursor: { afterSeq?: number; limit: number },
  resolve: readonly string[] = [],
): TimelineView {
  const entries = store.ledger(id, cursor)
  const wanted = new Set(resolve)
  return {
    entries: entries.map((entry) => ({
      ...entry,
      payload: wanted.has(entry.kind) ? payload(store, id, entry) : undefined,
    })),
    cursor: entries.at(-1)?.seq ?? cursor.afterSeq ?? 0,
    more: entries.length === cursor.limit,
  }
}

/** Actions still recorded as uncertain. Recovery and the UI both need exactly this slice. */
export function uncertainActions(store: Store, id: string): Action[] {
  return store.tail("actions", id, 200, { path: "$.status", values: ["UNKNOWN", "STARTED"] })
}

function payload(store: Store, id: string, entry: LedgerEntry) {
  if (entry.kind === "message") return store.messages(id, { offset: Number(entry.ref), limit: 1 }).at(0)
  if (entry.kind === "actions" || entry.kind === "evidence" || entry.kind === "turns" || entry.kind === "events")
    return store.record(entry.kind, id, entry.ref)
  return undefined
}
