import { SqliteStore } from "../../src/storage/sqlite"
const [database, sessionId, marker] = process.argv.slice(2)
if (!database || !sessionId || !marker) process.exit(1)
const store = new SqliteStore(database)
store.acquire(sessionId, store.get(sessionId).workspace)
store.put("actions", {
  id: "crashed-action",
  sessionId,
  turnId: "turn",
  type: "tool",
  tool: "bash",
  implementation: "bash@1",
  target: marker,
  reason: "crash scenario",
  arguments: {},
  risk: "high",
  sideEffect: true,
  status: "STARTED",
  startedAt: Date.now(),
  evidenceIds: [],
})
await Bun.write(marker, "side effect already happened")
process.exit(23)
