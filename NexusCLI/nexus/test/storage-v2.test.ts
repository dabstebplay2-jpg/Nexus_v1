import { Database } from "bun:sqlite"
import { expect, test } from "bun:test"
import path from "node:path"
import { SqliteStore } from "../src/storage/sqlite"
import { schemaVersion } from "../src/storage/migrations"
import { evidenceView, sessionView, timelineView, transcriptView, uncertainActions } from "../src/storage/projections"
import type { LedgerEntry } from "../src/domain/ports"
import type { Evidence, Message } from "../src/domain/types"
import { answer, fixture, model } from "./helpers"

const volume = 10000

function message(index: number): Message {
  return { role: index % 2 === 0 ? "assistant" : "user", content: `turn ${index}: ${"payload ".repeat(8)}` }
}

/** Walks the whole append-only ledger through its durable cursor. */
function drain(store: SqliteStore, sessionId: string, page = 4096): LedgerEntry[] {
  const all: LedgerEntry[] = []
  let afterSeq = 0
  for (;;) {
    const batch = store.ledger(sessionId, { afterSeq, limit: page })
    if (!batch.length) return all
    all.push(...batch)
    afterSeq = batch[batch.length - 1]!.seq
  }
}

function evidence(sessionId: string, index: number): Evidence {
  return {
    id: `ev-${String(index).padStart(6, "0")}`,
    sessionId,
    source: "verification",
    timestamp: 1700000000000 + index,
    kind: index % 3 === 0 ? "TEST_RESULT" : "BUILD_RESULT",
    command: `check ${index}`,
    expected: { exitCode: 0 },
    actual: { exitCode: index % 3 === 0 ? 0 : 1 },
    verdict: index % 3 === 0 ? "pass" : "fail",
    metadata: { index },
    contractRevision: 1,
  }
}

/**
 * C2 regression: the append-only event log must make session growth linear.
 *
 * v0.2.2 kept the transcript inside the session JSON blob and re-projected every message row on
 * every `save()`, so a session paid O(n) per save and O(n^2) over its life (measured: 1.5 ms per
 * save at 500 messages, 17.7 ms at 4000, 37.2 s for 4000 saves). `save()` runs on every message,
 * tool result and state transition, so this was the dominant cost of a long session.
 *
 * The load-bearing assertion here is not a timing: it is that 10 000 saves perform exactly 10 000
 * transcript writes. The old design performed sum(1..10000) = 50 005 000 of them.
 */
test("10 000 appended messages cost 10 000 writes, not 50 005 000, and per-save cost stays flat", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Grow a long session", model })
    const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    try {
      const current = store.get(session.id)
      const opening = current.conversation.length
      const openingVersion = current.version
      const samples: number[] = []
      const started = Bun.nanoseconds()
      for (let index = 0; index < volume; index++) {
        current.conversation.push(message(index))
        const before = Bun.nanoseconds()
        store.save(current)
        samples.push(Bun.nanoseconds() - before)
      }
      const elapsedMs = (Bun.nanoseconds() - started) / 1e6

      expect(store.messageCount(session.id)).toBe(opening + volume)
      expect(current.version).toBe(openingVersion + volume)

      // One ledger envelope per transcript write. Quadratic rewriting would emit millions.
      const ledger = drain(store, session.id)
      const writes = ledger.filter((entry) => entry.kind === "message").length
      expect(writes).toBe(opening + volume)

      // Sequence numbers are stable and strictly increasing: the ledger is append-only.
      expect(ledger.map((entry) => entry.seq)).toEqual([...ledger].sort((a, b) => a.seq - b.seq).map((e) => e.seq))
      expect(new Set(ledger.map((entry) => entry.seq)).size).toBe(ledger.length)

      // Timing is a secondary guard, deliberately loose: the shape must be flat, not fast.
      const window = Math.floor(volume / 10)
      const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
      const first = median(samples.slice(0, window))
      const last = median(samples.slice(-window))
      expect(last).toBeLessThan(first * 4)
      expect(elapsedMs).toBeLessThan(20000)
    } finally {
      store.close()
    }
  } finally {
    await f.cleanup()
  }
}, 180000)

test("a reopened store returns the whole transcript in order and pages it without loading it", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Persist", model })
    const first = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    let opening = 0
    try {
      const current = first.get(session.id)
      opening = current.conversation.length
      for (let index = 0; index < 250; index++) {
        current.conversation.push(message(index))
        first.save(current)
      }
    } finally {
      first.close()
    }
    const second = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    try {
      const reloaded = second.get(session.id)
      expect(reloaded.conversation).toHaveLength(opening + 250)
      expect(reloaded.conversation[opening]).toEqual(message(0))
      expect(reloaded.conversation[opening + 249]).toEqual(message(249))

      // `header` is the O(1) read: same session, no transcript.
      const header = second.header(session.id)
      expect(header.conversation).toEqual([])
      expect(header.goal).toBe(reloaded.goal)
      expect(second.messageCount(session.id)).toBe(opening + 250)

      const page = second.messages(session.id, { offset: opening + 10, limit: 5 })
      expect(page).toEqual([10, 11, 12, 13, 14].map(message))

      const view = transcriptView(second, session.id, { offset: 0, limit: 20 })
      expect(view.total).toBe(opening + 250)
      expect(view.rows).toHaveLength(20)
      expect(view.more).toBe(true)
      expect(transcriptView(second, session.id, { offset: opening + 240, limit: 20 }).more).toBe(false)
    } finally {
      second.close()
    }
  } finally {
    await f.cleanup()
  }
})

test("truncating or branching persisted history falls back to a full rewrite and stays correct", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Rewrite", model })
    const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    try {
      const current = store.get(session.id)
      const opening = current.conversation.length
      for (let index = 0; index < 40; index++) {
        current.conversation.push(message(index))
        store.save(current)
      }

      // Truncation: shorter than what is persisted, so the append fast path must not be taken.
      current.conversation.length = opening + 10
      store.save(current)
      expect(store.messageCount(session.id)).toBe(opening + 10)
      expect(store.get(session.id).conversation).toHaveLength(opening + 10)
      expect(store.messages(session.id).at(-1)).toEqual(message(9))

      // Branching: same length, different boundary message.
      current.conversation[opening + 9] = { role: "user", content: "branched" }
      store.save(current)
      expect(store.messages(session.id).at(-1)).toEqual({ role: "user", content: "branched" })

      // Appending after a rewrite resumes the fast path from the new length.
      current.conversation.push(message(99))
      store.save(current)
      expect(store.messageCount(session.id)).toBe(opening + 11)
      expect(store.get(session.id).conversation.at(-1)).toEqual(message(99))
      expect(store.get(session.id).conversation.at(-2)).toEqual({ role: "user", content: "branched" })
    } finally {
      store.close()
    }
  } finally {
    await f.cleanup()
  }
})

test("bounded reads over a large projection agree with the full list", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Read", model })
    const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    try {
      store.transaction(() => {
        for (let index = 0; index < 600; index++) store.put("evidence", evidence(session.id, index))
      })
      expect(store.count("evidence", session.id)).toBe(600)
      expect(store.record("evidence", session.id, "ev-000123")?.command).toBe("check 123")
      expect(store.record("evidence", session.id, "ev-999999")).toBeUndefined()

      const whole = store.list("evidence", session.id)
      expect(store.page("evidence", session.id, { offset: 100, limit: 10 }).map((row) => row.id)).toEqual(
        whole.slice(100, 110).map((row) => row.id),
      )
      expect(store.tail("evidence", session.id, 5).map((row) => row.id)).toEqual(whole.slice(-5).map((row) => row.id))

      // A JSON filter narrows the tail inside SQLite instead of loading the projection.
      const failures = store.tail("evidence", session.id, 7, { path: "$.verdict", values: ["fail"] })
      expect(failures).toHaveLength(7)
      expect(failures.every((row) => row.verdict === "fail")).toBe(true)
      expect(failures.map((row) => row.id)).toEqual(
        whole
          .filter((row) => row.verdict === "fail")
          .slice(-7)
          .map((row) => row.id),
      )

      const paged = evidenceView(store, session.id, { offset: 590, limit: 20 })
      expect(paged.total).toBe(600)
      expect(paged.rows).toHaveLength(10)
      expect(paged.more).toBe(false)
      expect(evidenceView(store, session.id, { offset: 0, limit: 20 }).more).toBe(true)

      const summary = sessionView(store, session.id)
      expect(summary.counts.evidence).toBe(600)
      expect(summary.session.conversation).toEqual([])
      expect(summary.ledgerHead).toBeGreaterThan(0)
      expect(uncertainActions(store, session.id)).toEqual([])
    } finally {
      store.close()
    }
  } finally {
    await f.cleanup()
  }
})

test("the timeline cursor is durable: resuming a stream yields no gaps and no repeats", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Stream", model })
    const store = new SqliteStore(path.join(f.root, "data", "nexus.db"))
    try {
      const current = store.get(session.id)
      for (let index = 0; index < 120; index++) {
        current.conversation.push(message(index))
        store.save(current)
        if (index % 4 === 0) store.put("evidence", evidence(session.id, index))
      }
      const expected = drain(store, session.id).map((entry) => entry.seq)
      expect(expected.length).toBeGreaterThan(140)

      const seen: number[] = []
      let cursor = 0
      for (;;) {
        const view = timelineView(store, session.id, { afterSeq: cursor, limit: 25 }, ["message", "evidence"])
        seen.push(...view.entries.map((entry) => entry.seq))
        cursor = view.cursor
        if (!view.more) break
      }
      expect(seen).toEqual(expected)
      expect(new Set(seen).size).toBe(seen.length)

      // Payloads are hydrated only for the requested kinds.
      const head = timelineView(store, session.id, { afterSeq: 0, limit: 400 }, ["evidence"])
      const evidenceEntry = head.entries.find((entry) => entry.kind === "evidence")!
      expect((evidenceEntry.payload as Evidence).id).toBe(evidenceEntry.ref)
      expect(head.entries.find((entry) => entry.kind === "message")?.payload).toBeUndefined()
    } finally {
      store.close()
    }
  } finally {
    await f.cleanup()
  }
})

test("a v1 database upgrades to v2 in place without losing sessions, transcripts or records", async () => {
  const f = await fixture(() => answer())
  try {
    const file = path.join(f.root, "legacy.db")
    const transcript = [0, 1, 2, 3, 4].map(message)
    const legacy = new Database(file, { create: true, strict: true })
    try {
      // Verbatim v0.2.2 schema, including the redundant `messages` projection that v2 drops.
      legacy.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL)")
      for (const table of [
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
      ])
        legacy.exec(
          `CREATE TABLE ${table} (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, session_id TEXT NOT NULL REFERENCES sessions(id), data TEXT NOT NULL); CREATE INDEX ${table}_session ON ${table}(session_id, seq)`,
        )
      legacy.exec(
        "CREATE TABLE owners (session_id TEXT PRIMARY KEY, workspace TEXT UNIQUE NOT NULL, pid INTEGER NOT NULL, token TEXT NOT NULL); PRAGMA user_version=1",
      )
      const stored = {
        ...f.api.inspect((await f.api.create({ workspace: f.workspace, goal: "Legacy", model })).id).session,
      }
      const blob = { ...stored, id: "legacy-session", version: 7, conversation: transcript }
      legacy
        .query("INSERT INTO sessions(id,version,data) VALUES (?,?,?)")
        .run("legacy-session", 7, JSON.stringify(blob))
      transcript.forEach((entry, position) =>
        legacy
          .query("INSERT INTO messages(id,session_id,data) VALUES (?,?,?)")
          .run(`legacy-session:${position}`, "legacy-session", JSON.stringify(entry)),
      )
      legacy
        .query("INSERT INTO evidence(id,session_id,data) VALUES (?,?,?)")
        .run("ev-000001", "legacy-session", JSON.stringify(evidence("legacy-session", 1)))
    } finally {
      legacy.close()
    }

    const upgraded = new SqliteStore(file)
    try {
      const version = new Database(file, { strict: true })
      expect(version.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version).toBe(schemaVersion)
      expect(() => version.query("SELECT 1 FROM messages").get()).toThrow()
      version.close()

      const session = upgraded.get("legacy-session")
      expect(session.goal).toBe("Legacy")
      expect(session.version).toBe(7)
      expect(session.conversation).toEqual(transcript)
      expect(upgraded.messageCount("legacy-session")).toBe(transcript.length)
      expect(upgraded.record("evidence", "legacy-session", "ev-000001")?.command).toBe("check 1")

      // The migrated session keeps working on the v2 append path.
      session.conversation.push(message(5))
      upgraded.save(session)
      expect(upgraded.get("legacy-session").conversation).toEqual([...transcript, message(5)])
      expect(upgraded.ledger("legacy-session", { limit: 10 }).filter((e) => e.kind === "message")).toHaveLength(1)
    } finally {
      upgraded.close()
    }
  } finally {
    await f.cleanup()
  }
})
