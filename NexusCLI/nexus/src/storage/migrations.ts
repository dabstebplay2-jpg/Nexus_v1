import type { Database } from "bun:sqlite"

export const schemaVersion = 2
/** Tables addressed generically through Store.put/list, keyed by record id. */
export const recordTables = [
  "plans",
  "plan_steps",
  "actions",
  "tool_calls",
  "evidence",
  "verification_runs",
  "context_epochs",
  "queued_inputs",
  "turns",
  "events",
]

export function migrate(db: Database) {
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")
  db.transaction(() => {
    const version = db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0
    if (version > schemaVersion) throw new Error(`Unsupported database version ${version}`)
    if (version === schemaVersion) return
    if (version === 0) create(db)
    else upgradeToV2(db)
    db.exec(`PRAGMA user_version=${schemaVersion}`)
  }).immediate()
}

function create(db: Database) {
  db.exec(
    "CREATE TABLE sessions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, messages INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL)",
  )
  recordTables.forEach((table) => {
    db.exec(
      `CREATE TABLE ${table} (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, session_id TEXT NOT NULL REFERENCES sessions(id), data TEXT NOT NULL); CREATE INDEX ${table}_session ON ${table}(session_id, seq)`,
    )
  })
  transcript(db)
  ledger(db)
  db.exec(
    "CREATE TABLE owners (session_id TEXT PRIMARY KEY, workspace TEXT UNIQUE NOT NULL, pid INTEGER NOT NULL, token TEXT NOT NULL)",
  )
}

/**
 * The transcript is the only unbounded part of a session, so it stops living inside the session
 * blob. Position is explicit rather than derived from a composite id, so appends are O(1) and
 * ordered reads need no parsing.
 */
function transcript(db: Database) {
  db.exec(
    "CREATE TABLE session_messages (session_id TEXT NOT NULL REFERENCES sessions(id), position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (session_id, position)) WITHOUT ROWID",
  )
}

/**
 * Append-only ledger with stable, monotonic sequence numbers.
 *
 * Every record write appends one envelope here; the typed tables above are projections holding
 * the latest state. Only the envelope is stored, never a second copy of the payload, so the
 * ledger costs a few bytes per write and `timelineView` can resume from a durable cursor.
 */
function ledger(db: Database) {
  db.exec(
    "CREATE TABLE session_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id), kind TEXT NOT NULL, ref TEXT NOT NULL, ts INTEGER NOT NULL); CREATE INDEX session_events_session ON session_events(session_id, seq)",
  )
}

/**
 * v1 -> v2. Moves each session's conversation out of its JSON blob into `session_messages`, so
 * `save()` stops re-serializing the whole transcript on every append.
 *
 * Runs inside the caller's immediate transaction: either the whole upgrade commits or the database
 * is untouched. v1's redundant `messages` projection is dropped only after its authoritative copy
 * (the session blob) has been transcribed.
 */
function upgradeToV2(db: Database) {
  db.exec("ALTER TABLE sessions ADD COLUMN messages INTEGER NOT NULL DEFAULT 0")
  transcript(db)
  ledger(db)
  const insert = db.query("INSERT INTO session_messages(session_id,position,data) VALUES (?,?,?)")
  const update = db.query("UPDATE sessions SET data=?, messages=? WHERE id=?")
  for (const row of db.query<{ id: string; data: string }, []>("SELECT id,data FROM sessions").all()) {
    const session = JSON.parse(row.data) as { conversation?: unknown[] }
    const conversation = Array.isArray(session.conversation) ? session.conversation : []
    conversation.forEach((message, position) => insert.run(row.id, position, JSON.stringify(message)))
    update.run(JSON.stringify({ ...session, conversation: [] }), conversation.length, row.id)
  }
  db.exec("DROP TABLE messages")
}
