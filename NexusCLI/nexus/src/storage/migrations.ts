import type { Database } from "bun:sqlite"

export function migrate(db: Database) {
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")
  db.transaction(() => {
    const version = db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0
    if (version > 1) throw new Error(`Unsupported database version ${version}`)
    if (version === 1) return
    db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL)")
    ;[
      "messages",
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
    ].forEach((table) => {
      db.exec(
        `CREATE TABLE ${table} (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, session_id TEXT NOT NULL REFERENCES sessions(id), data TEXT NOT NULL); CREATE INDEX ${table}_session ON ${table}(session_id, seq)`,
      )
    })
    db.exec(
      "CREATE TABLE owners (session_id TEXT PRIMARY KEY, workspace TEXT UNIQUE NOT NULL, pid INTEGER NOT NULL, token TEXT NOT NULL); PRAGMA user_version=1",
    )
  }).immediate()
}
