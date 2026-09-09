import { Database } from "bun:sqlite"
import type { Store } from "../domain/ports"
import type { AgentSession, TableRecords } from "../domain/types"
import { NexusError } from "../shared/errors"
import { migrate } from "./migrations"

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
    this.db.query("INSERT INTO sessions VALUES (?, ?, ?)").run(session.id, session.version, JSON.stringify(session))
  }
  get(id: string): AgentSession {
    const row = this.db.query<{ data: string }, [string]>("SELECT data FROM sessions WHERE id=?").get(id)
    if (!row) throw new NexusError("NOT_FOUND", `Session ${id} does not exist`)
    const session = JSON.parse(row.data) as AgentSession
    const pending = this.list("queued_inputs", id).filter((input) => !input.promoted)
    session.queuedPrompts = pending.filter((input) => input.delivery === "QUEUE").map((input) => input.id)
    session.steerMessages = pending.filter((input) => input.delivery === "STEER").map((input) => input.id)
    return session
  }
  sessions(): AgentSession[] {
    return this.db
      .query<{ data: string }, []>("SELECT data FROM sessions ORDER BY rowid DESC")
      .all()
      .map((row) => JSON.parse(row.data))
  }
  save(session: AgentSession) {
    this.transaction(() => {
      const next = { ...session, version: session.version + 1, updatedAt: Date.now() }
      const result = this.db
        .query("UPDATE sessions SET version=?, data=? WHERE id=? AND version=?")
        .run(next.version, JSON.stringify(next), session.id, session.version)
      if (!result.changes) throw new NexusError("CONFLICT", "Session changed concurrently")
      session.conversation.forEach((message, index) =>
        this.project("messages", `${session.id}:${index}`, session.id, message),
      )
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
    })
  }
  list<K extends keyof TableRecords>(table: K, sessionId: string): TableRecords[K][] {
    return this.db
      .query<{ data: string }, [string]>(`SELECT data FROM ${table} WHERE session_id=? ORDER BY seq`)
      .all(sessionId)
      .map((row) => JSON.parse(row.data))
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
  private project(table: string, id: string, sessionId: string, data: unknown) {
    const result = this.db
      .query(
        `INSERT INTO ${table}(id,session_id,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE ${table}.session_id=excluded.session_id`,
      )
      .run(id, sessionId, JSON.stringify(data))
    if (!result.changes) throw new NexusError("CONFLICT", "Record ID already belongs to another session")
  }
}
function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH")
  }
}
