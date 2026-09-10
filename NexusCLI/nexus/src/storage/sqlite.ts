import { Database } from "bun:sqlite"
import type { LedgerEntry, Range, Store, TailFilter } from "../domain/ports"
import type { AgentSession, Message, TableRecords } from "../domain/types"
import { NexusError } from "../shared/errors"
import { migrate } from "./migrations"

/**
 * Storage v2: append-only writes, projected reads.
 *
 * v0.2.2 kept the whole session — transcript included — in one JSON blob and re-projected every
 * message row on every `save()`. Both halves were O(transcript), and `save()` runs on every
 * message, tool result and state transition, so a long session degraded quadratically (measured:
 * 1.5 ms per save at 500 messages, 17.7 ms at 4000).
 *
 * Here the transcript lives in `session_messages` and is appended, never rewritten; the session
 * row carries only the header. `session_events` records every write as an envelope with a stable
 * sequence number, which gives the timeline a durable cursor without duplicating payloads.
 */
export class SqliteStore implements Store {
  private readonly db: Database
  constructor(filename: string) {
    this.db = new Database(filename, { create: true, strict: true })
    migrate(this.db)
  }
  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate()
  }
  create(session: AgentSession) {
    this.transaction(() => {
      this.db
        .query("INSERT INTO sessions(id,version,messages,data) VALUES (?,?,?,?)")
        .run(session.id, session.version, session.conversation.length, JSON.stringify(header(session)))
      this.writeMessages(session.id, session.conversation, 0)
    })
  }
  get(id: string): AgentSession {
    const session = this.header(id)
    session.conversation = this.messages(id)
    return session
  }
  header(id: string): AgentSession {
    const row = this.db.query<{ data: string }, [string]>("SELECT data FROM sessions WHERE id=?").get(id)
    if (!row) throw new NexusError("NOT_FOUND", `Session ${id} does not exist`)
    const session = JSON.parse(row.data) as AgentSession
    const pending = this.list("queued_inputs", id).filter((input) => !input.promoted)
    session.queuedPrompts = pending.filter((input) => input.delivery === "QUEUE").map((input) => input.id)
    session.steerMessages = pending.filter((input) => input.delivery === "STEER").map((input) => input.id)
    return session
  }
  sessions(): AgentSession[] {
    return this.headers().map((session) => {
      session.conversation = this.messages(session.id)
      return session
    })
  }
  /** Every session without its transcript. Listing endpoints should prefer this over `sessions`. */
  headers(): AgentSession[] {
    return this.db
      .query<{ data: string }, []>("SELECT data FROM sessions ORDER BY rowid DESC")
      .all()
      .map((row) => JSON.parse(row.data) as AgentSession)
  }
  save(session: AgentSession) {
    this.transaction(() => {
      const next = { ...session, version: session.version + 1, updatedAt: Date.now() }
      // The transcript is append-only everywhere in the loop (agent-loop, recovery and inbox only
      // push; context compaction moves epochStart instead of rewriting). The boundary check proves
      // that for this save; anything else falls back to a full rewrite, correctness over speed.
      // Both reads must happen before the header update, which overwrites the persisted count.
      const persisted = this.messageCount(session.id)
      const appendOnly =
        next.conversation.length >= persisted && this.boundaryMatches(session.id, next.conversation, persisted)
      const result = this.db
        .query("UPDATE sessions SET version=?, messages=?, data=? WHERE id=? AND version=?")
        .run(next.version, next.conversation.length, JSON.stringify(header(next)), session.id, session.version)
      if (!result.changes) throw new NexusError("CONFLICT", "Session changed concurrently")
      if (!appendOnly) this.db.query("DELETE FROM session_messages WHERE session_id=?").run(session.id)
      this.writeMessages(session.id, next.conversation, appendOnly ? persisted : 0)
      this.project("plans", session.id, session.id, session.plan)
      this.db.query("DELETE FROM plan_steps WHERE session_id=?").run(session.id)
      session.plan.forEach((step) => this.project("plan_steps", `${session.id}:${step.id}`, session.id, step))
      session.version = next.version
      session.updatedAt = next.updatedAt
    })
  }
  put<K extends keyof TableRecords>(table: K, value: TableRecords[K]) {
    this.transaction(() => {
      this.project(table, value.id, value.sessionId, value)
      if (table === "actions") this.project("tool_calls", value.id, value.sessionId, value)
      this.append(value.sessionId, table, value.id)
    })
  }
  list<K extends keyof TableRecords>(table: K, sessionId: string): TableRecords[K][] {
    return this.db
      .query<{ data: string }, [string]>(`SELECT data FROM ${table} WHERE session_id=? ORDER BY seq`)
      .all(sessionId)
      .map((row) => JSON.parse(row.data))
  }
  record<K extends keyof TableRecords>(table: K, sessionId: string, id: string): TableRecords[K] | undefined {
    const row = this.db
      .query<{ data: string }, [string, string]>(`SELECT data FROM ${table} WHERE session_id=? AND id=?`)
      .get(sessionId, id)
    return row ? (JSON.parse(row.data) as TableRecords[K]) : undefined
  }
  count<K extends keyof TableRecords>(table: K, sessionId: string): number {
    return (
      this.db
        .query<{ total: number }, [string]>(`SELECT COUNT(*) AS total FROM ${table} WHERE session_id=?`)
        .get(sessionId)?.total ?? 0
    )
  }
  page<K extends keyof TableRecords>(table: K, sessionId: string, range: Range): TableRecords[K][] {
    return this.db
      .query<{ data: string }, [string, number, number]>(
        `SELECT data FROM ${table} WHERE session_id=? ORDER BY seq LIMIT ? OFFSET ?`,
      )
      .all(sessionId, range.limit, range.offset ?? 0)
      .map((row) => JSON.parse(row.data))
  }
  /** The newest `limit` records, oldest-first, optionally narrowed by a JSON property. */
  tail<K extends keyof TableRecords>(
    table: K,
    sessionId: string,
    limit: number,
    filter?: TailFilter,
  ): TableRecords[K][] {
    // CAST keeps the comparison correct for JSON numbers as well as strings.
    const predicate = filter
      ? ` AND CAST(json_extract(data,?) AS TEXT) IN (${filter.values.map(() => "?").join(",")})`
      : ""
    const bindings: (string | number)[] = [sessionId, ...(filter ? [filter.path, ...filter.values] : []), limit]
    return this.db
      .query<{ data: string }, (string | number)[]>(
        `SELECT data FROM (SELECT data,seq FROM ${table} WHERE session_id=?${predicate} ORDER BY seq DESC LIMIT ?) ORDER BY seq ASC`,
      )
      .all(...bindings)
      .map((row) => JSON.parse(row.data))
  }
  messageCount(sessionId: string): number {
    return (
      this.db.query<{ messages: number }, [string]>("SELECT messages FROM sessions WHERE id=?").get(sessionId)
        ?.messages ?? 0
    )
  }
  messages(sessionId: string, range?: Range): Message[] {
    const window = range ? " LIMIT ? OFFSET ?" : ""
    const bindings: (string | number)[] = [sessionId, ...(range ? [range.limit, range.offset ?? 0] : [])]
    return this.db
      .query<{ data: string }, (string | number)[]>(
        `SELECT data FROM session_messages WHERE session_id=? ORDER BY position${window}`,
      )
      .all(...bindings)
      .map((row) => JSON.parse(row.data) as Message)
  }
  /** Append-only ledger read from a durable cursor. `seq` is stable and strictly increasing. */
  ledger(sessionId: string, cursor: { afterSeq?: number; limit: number }): LedgerEntry[] {
    return this.db
      .query<
        LedgerEntry,
        [string, number, number]
      >("SELECT seq,kind,ref,ts FROM session_events WHERE session_id=? AND seq>? ORDER BY seq LIMIT ?")
      .all(sessionId, cursor.afterSeq ?? 0, cursor.limit)
  }
  acquire(sessionId: string, workspace: string) {
    const token = crypto.randomUUID()
    this.transaction(() => {
      const owner = this.db
        .query<
          { session_id: string; pid: number },
          [string, string]
        >("SELECT session_id,pid FROM owners WHERE session_id=? OR workspace=?")
        .get(sessionId, workspace)
      if (owner && alive(owner.pid)) throw new NexusError("BUSY", `Workspace/session is owned by process ${owner.pid}`)
      if (owner) this.db.query("DELETE FROM owners WHERE session_id=?").run(owner.session_id)
      this.db.query("INSERT INTO owners VALUES (?,?,?,?)").run(sessionId, workspace, process.pid, token)
    })
    return () => {
      this.db.query("DELETE FROM owners WHERE session_id=? AND token=?").run(sessionId, token)
    }
  }
  close() {
    this.db.close()
  }
  private boundaryMatches(sessionId: string, conversation: readonly Message[], persisted: number) {
    if (persisted === 0) return true
    const row = this.db
      .query<{ data: string }, [string, number]>("SELECT data FROM session_messages WHERE session_id=? AND position=?")
      .get(sessionId, persisted - 1)
    return row?.data === JSON.stringify(conversation[persisted - 1])
  }
  private writeMessages(sessionId: string, conversation: readonly Message[], from: number) {
    const insert = this.db.query(
      "INSERT INTO session_messages(session_id,position,data) VALUES (?,?,?) ON CONFLICT(session_id,position) DO UPDATE SET data=excluded.data",
    )
    for (let position = from; position < conversation.length; position++) {
      insert.run(sessionId, position, JSON.stringify(conversation[position]))
      this.append(sessionId, "message", String(position))
    }
  }
  private append(sessionId: string, kind: string, ref: string) {
    this.db
      .query("INSERT INTO session_events(session_id,kind,ref,ts) VALUES (?,?,?,?)")
      .run(sessionId, kind, ref, Date.now())
  }
  private project(table: string, id: string, sessionId: string, data: unknown) {
    const result = this.db
      .query(
        `INSERT INTO ${table}(id,session_id,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE ${table}.session_id=excluded.session_id`,
      )
      .run(id, sessionId, JSON.stringify(data))
    if (!result.changes) throw new NexusError("CONFLICT", "Record ID already belongs to another session")
  }
}
/** The session row carries everything except the transcript, which is appended separately. */
function header(session: AgentSession) {
  return { ...session, conversation: [] }
}
function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH")
  }
}
