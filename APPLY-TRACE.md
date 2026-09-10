# Nexus v0.3 — Trace Architecture (foundation)

Drop-in tree for `NexusCLI/nexus/`. Paths in this archive mirror the repository exactly, so:

```bash
# from the repository root
cp -r nexus-v0.3-trace/NexusCLI/nexus/. NexusCLI/nexus/
cd NexusCLI/nexus
bun install
bun test test/trace.test.ts
bun test
```

Delivered as files rather than a branch because the GitHub connection is read-only
(`create_branch` → 403 *Resource not accessible by personal access token*). With `contents: write`
the same tree pushes to `feat/nexus-v0.3-trace-architecture`.

## New files (4)

| File | Purpose |
| --- | --- |
| `src/domain/trace.ts` | The `TraceEvent` contract, the 12 node types, the 6 tool phases, `isTraceEvent()` and the derived id helpers. No imports, no behaviour. |
| `src/core/trace.ts` | `TraceRecorder`: builds envelopes, redacts and bounds them, publishes through the existing `publish()`. Also `thinkingSummary()`. |
| `src/trace/projection.ts` | Pure folding of ledger events into the tree: `traceEvents`, `traceHistory`, `toolLifecycle`, `traceTree`. |
| `test/trace.test.ts` | 6 tests: creation/nesting, lifecycle, waiting-on-human, restart, thinking-cannot-complete, redaction bounds. |

## Modified files (7)

| File | Change | Size |
| --- | --- | --- |
| `src/core/state.ts` | `publish()` returns the stored `Event`. Nothing else; `transition()` untouched. | 2 lines |
| `src/tools/registry.ts` | `ToolContext.progress?` — optional advisory hook for STREAMING_OUTPUT. | 6 lines |
| `src/tools/executor.ts` | Optional 4th ctor arg `trace`, optional 8th `execute()` arg `traceParentId`; phase calls at the points that already existed (permission wait, start, result, catch). | ~55 lines |
| `src/core/agent-loop.ts` | Optional `deps.trace`; publishes task/turn/context_update/thinking/plan/observation/verification/completion nodes alongside the `publish()` calls already there. Control flow unchanged. | ~130 lines |
| `src/verification/engine.ts` | `run()` takes an optional `traceParentId` and forwards it to the executor. | 2 lines |
| `src/composition.ts` | Constructs one `TraceRecorder`, passes it to the executor and the loop, threads `ctx.actionId` into `verify`, adds `trace` to `inspect()`. | ~12 lines |
| `src/api.ts` | `inspect()` returns `trace: TraceNode[]`; re-exports the trace types. | 5 lines |

## Deliberately not modified

- `src/domain/types.ts` — trace types live in the sibling `src/domain/trace.ts`; `Event.data` was
  already the extension point, so nothing in the existing contract needed touching.
- `apps/shared/protocol.ts`, `apps/server/**` — trace events are ordinary `Event`s, so
  `RunManager.ingest` wraps them into `StreamEvent` and SSE ships them with **zero** transport
  changes. The web client can `import type { TraceEvent } from "../../src/domain/trace"`, the same
  path style `protocol.ts` already uses.
- `apps/web/**` — no UI work in this phase, by instruction.
- `src/permissions/engine.ts`, `src/completion/policy.ts`, `src/intelligence/**` — untouched.

## Invariants

1. **One publisher.** Every node goes through `publish()` in `src/core/state.ts`. No new table, no
   new sink, no second stream.
2. **Ledger-native.** Nodes land in the `events` projection and the append-only `session_events`
   ledger. Phase changes re-publish the same node id, so history is append-only and the tree is
   rebuilt on read by `traceTree()` — identical after a restart.
3. **Safe by construction.** Titles, summaries and payloads pass through `redact()` → `safeJson()`
   → `bound()` in `src/core/trace.ts`. `diff` nodes carry hashes and byte counts, never file
   contents.
4. **Advisory only.** Nothing in `src/completion/policy.ts`, `src/permissions/engine.ts`,
   `src/intelligence/supervisor.ts` or `src/loop-guard/policy.ts` reads a trace node. Removing the
   recorder (`trace` is optional everywhere) restores byte-identical behaviour.
