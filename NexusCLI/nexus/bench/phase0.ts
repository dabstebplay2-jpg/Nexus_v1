/**
 * Phase 0 performance benchmark: incremental workspace index (C1) and Storage v2 (C2).
 *
 * Every number Phase 0 claims is produced here, next to a verbatim reimplementation of the
 * v0.2.2 code it replaced, so the comparison is measured rather than asserted. This is not part
 * of `bun run check`: it allocates a ~40 MB workspace and writes 10 000 sessions rows.
 *
 * Usage:
 *   bun run bench:phase0
 *   bun run bench:phase0 --files=2000 --messages=2000 --json
 */
import { Database } from "bun:sqlite"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { SqliteStore } from "../src/storage/sqlite"
import { inventory, inventoryFingerprint } from "../src/verification/delta"
import { files } from "../src/tools/workspace"
import { normalise } from "../src/workspace/paths"
import { workspaceIndex, releaseWorkspaceIndex } from "../src/workspace/index/fingerprint"
import type { AgentSession, Evidence, Message } from "../src/domain/types"

const args = process.argv.slice(2)
const number = (name: string, fallback: number) =>
  Number(args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback)
const fileCount = number("files", 10000)
const messageCount = number("messages", 10000)
const asJson = args.includes("--json")

const ms = (from: number) => (Bun.nanoseconds() - from) / 1e6
const time = async (run: () => Promise<unknown> | unknown) => {
  const started = Bun.nanoseconds()
  await run()
  return ms(started)
}
const median = (values: number[]) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] ?? 0
const report: Record<string, unknown> = { files: fileCount, messages: messageCount }
const log = (line: string) => {
  if (!asJson) console.log(line)
}

/* ------------------------------------------------------------------ C1 ---- */

/** v0.2.2 `inventory`, copied verbatim: one content hash per candidate file, every single pass. */
async function legacyInventory(workspace: string, generated: readonly string[] = []) {
  const listed = Bun.spawnSync(["git", "--no-optional-locks", "ls-files", "-c", "-o", "--exclude-standard", "-z"], {
    cwd: workspace,
  })
  const tracked =
    listed.exitCode === 0
      ? new TextDecoder().decode(listed.stdout).split("\0").filter(Boolean).map(normalise)
      : undefined
  const candidates = (tracked ?? (await files(workspace)).map(normalise)).filter(
    (file) =>
      !generated.some((entry) => (entry.endsWith("/") ? normalise(file).startsWith(entry) : normalise(file) === entry)),
  )
  const entries = await Promise.all(
    candidates.map(async (file) => {
      const hash = await readFile(path.join(workspace, file))
        .then((bytes) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex"))
        .catch(() => undefined)
      return hash === undefined ? undefined : ([file, hash] as const)
    }),
  )
  return {
    paths: new Map(entries.filter((entry): entry is [string, string] => entry !== undefined)),
    git: tracked !== undefined,
  }
}
function legacyFingerprint(snapshot: { paths: Map<string, string> }) {
  const hasher = new Bun.CryptoHasher("sha256")
  for (const file of [...snapshot.paths.keys()].sort()) hasher.update(file).update(snapshot.paths.get(file)!)
  return hasher.digest("hex")
}

async function benchmarkIndex(root: string) {
  const workspace = path.join(root, "workspace")
  const directories = Math.max(1, Math.floor(fileCount / 100))
  for (let directory = 0; directory < directories; directory++) {
    await mkdir(path.join(workspace, `pkg${directory}`, "deep"), { recursive: true })
    await Promise.all(
      Array.from({ length: Math.ceil(fileCount / directories) }, (_, file) =>
        writeFile(
          path.join(workspace, `pkg${directory}`, file % 3 === 0 ? "deep" : ".", `mod${file}.ts`),
          `export const value${file} = ${file}\n${"// filler\n".repeat(400)}`,
        ),
      ),
    )
  }
  await writeFile(path.join(workspace, "package.json"), JSON.stringify({ name: "benchmark" }))
  const listing = await files(workspace)
  const bytes = listing.reduce((total, file) => total + Bun.file(path.join(workspace, file)).size, 0)
  log(`\n\u001b[1mC1 incremental workspace index\u001b[0m — ${listing.length} files, ${(bytes / 1e6).toFixed(1)} MB`)

  // The completion fingerprint is the proof identity, so it must be byte-identical to v0.2.2.
  for (const generated of [[], ["pkg0/mod3.ts", "pkg1/"]]) {
    const legacy = legacyFingerprint(await legacyInventory(workspace, generated))
    const modern = inventoryFingerprint(await inventory(workspace, generated))
    if (legacy !== modern) throw new Error(`Fingerprint drift for generated=${JSON.stringify(generated)}`)
    log(`  fingerprint(generated=${JSON.stringify(generated)}): identical to v0.2.2 (${modern.slice(0, 12)}…)`)
  }

  // Every pass is timed and counted in the same call: `reads` is per-invocation, so a second
  // call for the counter would report the already-warm number.
  const pass = async () => {
    const started = Bun.nanoseconds()
    const snapshot = await inventory(workspace)
    return { ms: ms(started), reads: snapshot.reads }
  }
  const index = workspaceIndex(workspace)
  index.clear()
  const cold = await pass()
  const unchanged = await pass()
  await writeFile(path.join(workspace, "pkg0", "mod1.ts"), "export const value1 = 999\n")
  const incremental = await pass()
  const legacyIncremental = await time(() => legacyInventory(workspace))

  const before = await index.walk()
  await writeFile(path.join(workspace, "pkg0", "mod2.ts"), "export const value2 = 1\n")
  const after = await index.walk()
  releaseWorkspaceIndex(workspace)

  report.c1 = {
    files: listing.length,
    bytes,
    legacyIncrementalMs: legacyIncremental,
    legacyIncrementalReads: listing.length,
    indexColdMs: cold.ms,
    indexColdReads: cold.reads,
    indexUnchangedMs: unchanged.ms,
    indexUnchangedReads: unchanged.reads,
    indexIncrementalMs: incremental.ms,
    indexIncrementalReads: incremental.reads,
    merkleDirectoriesRecomputed: after.stats.recomputed,
    merkleRootChanged: before.treeHash !== after.treeHash,
  }
  log(`  v0.2.2  after one edit : ${legacyIncremental.toFixed(0)} ms, ${listing.length} content reads`)
  log(`  index   cold           : ${cold.ms.toFixed(0)} ms, ${cold.reads} content reads`)
  log(`  index   unchanged      : ${unchanged.ms.toFixed(0)} ms, ${unchanged.reads} content reads`)
  log(`  index   after one edit : ${incremental.ms.toFixed(0)} ms, ${incremental.reads} content reads`)
  log(
    `  \u001b[1mreads ${listing.length} -> ${incremental.reads}\u001b[0m, wall clock ${(legacyIncremental / incremental.ms).toFixed(1)}x, merkle recomputed ${after.stats.recomputed} directories`,
  )
}

/* ------------------------------------------------------------------ C2 ---- */

/** v0.2.2 `save`: re-serialize the whole session blob and re-project every message row. */
class LegacyStore {
  private readonly db: Database
  /** Statement executions, not surviving rows: the point is the write amplification. */
  written = 0
  constructor(filename: string) {
    this.db = new Database(filename, { create: true, strict: true })
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000")
    this.db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL)")
    this.db.exec(
      "CREATE TABLE messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, session_id TEXT NOT NULL, data TEXT NOT NULL); CREATE INDEX messages_session ON messages(session_id, seq)",
    )
  }
  create(session: { id: string; version: number }) {
    this.db.query("INSERT INTO sessions VALUES (?,?,?)").run(session.id, session.version, JSON.stringify(session))
  }
  save(session: { id: string; version: number; conversation: Message[] }) {
    this.db.transaction(() => {
      const next = { ...session, version: session.version + 1 }
      this.db
        .query("UPDATE sessions SET version=?, data=? WHERE id=? AND version=?")
        .run(next.version, JSON.stringify(next), session.id, session.version)
      const insert = this.db.query(
        "INSERT INTO messages(id,session_id,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      session.conversation.forEach((message, index) => {
        insert.run(`${session.id}:${index}`, session.id, JSON.stringify(message))
        this.written++
      })
      session.version = next.version
    })()
  }
  close() {
    this.db.close()
  }
}

const evidence = (sessionId: string, index: number): Evidence => ({
  id: `ev-${String(index).padStart(7, "0")}`,
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
})

const message = (index: number): Message => ({
  role: index % 2 === 0 ? "assistant" : "user",
  content: `turn ${index}: ${"payload ".repeat(8)}`,
})

async function benchmarkStorage(root: string) {
  log(`\n\u001b[1mC2 storage v2\u001b[0m — ${messageCount} sequential saves`)
  const marks = [...new Set([500, 1000, 2000, 4000, messageCount])]
    .filter((mark) => mark <= messageCount)
    .sort((a, b) => a - b)
  const window = 25

  // v0.2.2 grows without bound, so it only runs up to 4000 saves — where it already needed 37 s.
  const legacyLimit = Math.min(messageCount, 4000)
  const legacy = new LegacyStore(path.join(root, "legacy.db"))
  const legacySession = { id: "legacy", version: 0, conversation: [] as Message[] }
  legacy.create(legacySession)
  const legacySamples: number[] = []
  const legacyStarted = Bun.nanoseconds()
  for (let index = 0; index < legacyLimit; index++) {
    legacySession.conversation.push(message(index))
    const started = Bun.nanoseconds()
    legacy.save(legacySession)
    legacySamples.push(ms(started))
  }
  const legacyElapsed = ms(legacyStarted)
  const legacyWrites = legacy.written
  legacy.close()

  const store = new SqliteStore(path.join(root, "v2.db"))
  const session = blankSession("v2")
  store.create(session)
  const samples: number[] = []
  const started = Bun.nanoseconds()
  for (let index = 0; index < messageCount; index++) {
    session.conversation.push(message(index))
    const mark = Bun.nanoseconds()
    store.save(session)
    samples.push(ms(mark))
  }
  const elapsed = ms(started)
  let writes = 0
  for (let afterSeq = 0; ; ) {
    const batch = store.ledger("v2", { afterSeq, limit: 4096 })
    if (!batch.length) break
    writes += batch.filter((entry) => entry.kind === "message").length
    afterSeq = batch[batch.length - 1]!.seq
  }
  // Bounded reads are only interesting against a populated projection, so fill one first.
  store.transaction(() => {
    for (let index = 0; index < messageCount; index++) store.put("evidence", evidence("v2", index))
  })
  const reads = {
    header: await time(() => store.header("v2")),
    count: await time(() => store.count("evidence", "v2")),
    record: await time(() => store.record("evidence", "v2", `ev-${String(messageCount >> 1).padStart(7, "0")}`)),
    page: await time(() => store.page("evidence", "v2", { offset: messageCount - 50, limit: 50 })),
    tail: await time(() => store.tail("evidence", "v2", 50, { path: "$.verdict", values: ["fail"] })),
    list: await time(() => store.list("evidence", "v2")),
  }
  store.close()

  const curve = marks.map((mark) => ({
    messages: mark,
    v2: median(samples.slice(Math.max(0, mark - window), mark)),
    legacy: mark <= legacyLimit ? median(legacySamples.slice(Math.max(0, mark - window), mark)) : undefined,
  }))
  report.c2 = {
    legacy: { saves: legacyLimit, totalMs: legacyElapsed, transcriptWrites: legacyWrites },
    v2: { saves: messageCount, totalMs: elapsed, transcriptWrites: writes },
    quadraticWrites: (messageCount * (messageCount + 1)) / 2,
    curve,
    boundedReadsMs: reads,
  }
  log(`  messages   v0.2.2 per save   v2 per save`)
  for (const point of curve)
    log(
      `  ${String(point.messages).padStart(8)}   ${(point.legacy === undefined ? "n/a" : `${point.legacy.toFixed(2)} ms`).padStart(15)}   ${`${point.v2.toFixed(3)} ms`.padStart(11)}`,
    )
  log(
    `  v0.2.2 : ${legacyLimit} saves in ${(legacyElapsed / 1000).toFixed(1)} s, ${legacyWrites} transcript writes (= n(n+1)/2)`,
  )
  log(`  v2     : ${messageCount} saves in ${(elapsed / 1000).toFixed(2)} s, ${writes} transcript writes`)
  log(
    `  \u001b[1mtranscript writes ${(messageCount * (messageCount + 1)) / 2} -> ${writes}\u001b[0m (${((messageCount * (messageCount + 1)) / 2 / writes).toFixed(0)}x amplification removed)`,
  )
  log(`  bounded reads over ${messageCount} evidence rows:`)
  for (const [name, value] of Object.entries(reads))
    log(
      `    ${name.padEnd(7)} ${`${value.toFixed(2)} ms`.padStart(9)}${name === "list" ? "   <- whole projection, kept for CompletionPolicy" : ""}`,
    )
}

function blankSession(id: string): AgentSession {
  const now = Date.now()
  return {
    id,
    workspace: path.join(tmpdir(), "nexus-benchmark-workspace"),
    goal: "benchmark",
    status: "INITIALIZING",
    version: 0,
    createdAt: now,
    updatedAt: now,
    conversation: [],
    plan: [],
    epoch: 0,
    epochStart: 0,
    summary: "",
    model: { model: "benchmark", capabilities: { contextLength: 64000 } } as AgentSession["model"],
    budgets: {} as AgentSession["budgets"],
    turns: 0,
    toolCount: 0,
    activeMs: 0,
    contract: { revision: 1, goal: "benchmark", mode: "coding", criteria: [], checks: [] },
    project: {} as AgentSession["project"],
    baseline: {} as AgentSession["baseline"],
    errors: [],
    ledgerId: id,
    evidenceStoreId: id,
    queuedPrompts: [],
    steerMessages: [],
  }
}

const root = await mkdtemp(path.join(tmpdir(), "nexus-phase0-"))
try {
  await benchmarkIndex(root)
  await benchmarkStorage(root)
  if (asJson) console.log(JSON.stringify(report, null, 2))
} finally {
  await rm(root, { recursive: true, force: true })
}
