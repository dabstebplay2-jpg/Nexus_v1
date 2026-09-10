# NEXUS PHASE 0 — FOUNDATION IMPLEMENTATION REPORT

**Project:** Nexus — Verifiable AI Engineering Environment
**Baseline:** v0.2.2, branch `nexus-v0.2.1-local-model-fix` @ `53b0896`
**Scope:** C1 Incremental Workspace Index · C2 Storage v2 · C3 Trust Manifest · C4 Sandbox interfaces
**Plan:** [`NEXUS_PHASE0_IMPLEMENTATION_PLAN.md`](./NEXUS_PHASE0_IMPLEMENTATION_PLAN.md)
**Status:** complete. `bun run check` → **7/7 green**, tests **142 pass / 3 skip / 0 fail** (baseline was 126/3/0).

---

## 0. Summary

Phase 0 removed the two algorithmic ceilings that limited Nexus to toy repositories and short
sessions, and closed the one hole through which a genuine exit code `0` could be turned into a
false `COMPLETE`. Nothing was rewritten: `CompletionPolicy`, `AgentLoop`, the `Provider` interface
and the verification philosophy are untouched, and the completion fingerprint is **byte-identical**
to v0.2.2.

| # | Problem in v0.2.2 | Result |
|---|---|---|
| C1 | Every verifying turn re-hashed the whole project (~10 full passes/turn) | Content reads per pass after a one-file edit: **10 001 → 1** |
| C2 | `save()` rewrote the transcript; `save()` runs on every message | Transcript writes over a 10 000-message session: **50 005 000 → 10 000**; 10 000 saves **~111 s → 0.90 s** |
| C3 | Only *already-known* anchors were re-hashed; a **new** `conftest.py` was invisible | Harness/config `introduced`, `modified` and `deleted` all void the proof |
| C4 | Tools ran directly against the host; no isolation seam | `SandboxProvider` / `ExecutionPolicy` / `NetworkPolicy` ports, load-bearing on day one |

Two latent bugs were found and fixed on the way — see [§5](#5-bugs-found-during-implementation).
Both would have shipped silently.

---

## 1. What changed

**New code: 991 lines across 13 source files. Modified: 19 files, +451/−149.**
**New tests: 739 lines across 3 files, 16 tests.** Benchmark: `bench/phase0.ts` (305 lines).

### New

```
src/workspace/paths.ts                  ignore rules, secret paths, path normalisation
src/workspace/index/cache.ts            FileMetadata + probe() + sameFile() + FileHashCache
src/workspace/index/merkle.ts           MerkleTree with dirty-ancestor invalidation
src/workspace/index/scan.ts             bounded parallel walk (readdir) + stat
src/workspace/index/fingerprint.ts      WorkspaceIndex + per-workspace memoized registry
src/storage/projections.ts              sessionView / evidenceView / transcriptView / timelineView
src/verification/trust/manifest.ts      exclusive vs extensible anchor patterns
src/verification/trust/discover.ts      admission-time discovery + trust.manifest.json overrides
src/verification/trust/guard.ts         evaluateTrust(): modified | deleted | introduced
src/verification/trust/file.ts          human-readable mirror in .nexus/
src/sandbox/ports.ts                    SandboxProvider, ExecutionPolicy, NetworkPolicy, PathScope
src/sandbox/policy.ts                   workspacePolicy(), withinScope(), scopedEnvironment()
src/sandbox/local.ts                    LocalSandboxProvider (honest: isolation = false)
bench/phase0.ts                         reproducible benchmark against a verbatim v0.2.2 oracle
```

### Modified — surgical, additive

`tools/workspace.ts` (delegates to the index) · `verification/delta.ts` (`inventory` takes anchors) ·
`verification/integrity.ts` (`establishTrust` / `trustViolations`) · `verification/engine.ts` (trust
evaluation per check, sandboxed execution) · `storage/sqlite.ts` (append-only transcript + bounded
reads) · `storage/migrations.ts` (schema v2 + `upgradeToV2`) · `domain/ports.ts`, `domain/types.ts`
(additive types only) · `tools/{registry,executor,builtin}.ts` (sandbox in `ToolContext`) ·
`composition.ts` (wiring) · `context/{manager,memory}.ts`, `recovery/policy.ts`, `git/rollback.ts`,
`session/inbox.ts` (full-projection reads → bounded reads).

### Explicitly untouched

`completion/policy.ts`, `core/agent-loop.ts`, `domain/ports.ts::Provider`, `llm/*`,
`permissions/engine.ts`, `loop-guard/*`, every app layer. No UI, no new features, no new models.

---

## 2. Benchmark results

Reproducible with `bun run bench:phase0` (`--json` for machine output). The benchmark carries a
**verbatim reimplementation of the v0.2.2 code** it replaced, so both columns are measured in the
same process on the same data, not quoted from an earlier run. Figures below are one representative
run on the reference machine (Amazon Linux 2023, Bun 1.4.2); wall-clock run-to-run variance is
roughly ±15%, so the *counters* — content reads and transcript writes — are the load-bearing
numbers, not the milliseconds.

### C1 — Incremental Workspace Index

Workspace: 10 001 files, 40.3 MB, 201 directories, page-cache warm.

| Pass | v0.2.2 | Phase 0 |
|---|---|---|
| cold | 79 ms / 10 001 content reads | 163 ms / 10 001 content reads |
| unchanged workspace | 79 ms / 10 001 reads | 48 ms / **0 reads** |
| after a one-file edit | 79 ms / 10 001 reads | 46 ms / **1 read** |
| Merkle directories recomputed | n/a (no tree) | **2 of 201** |
| completion fingerprint | — | **byte-identical** (verified for empty and non-empty `generatedPaths`) |

Wall clock improves 1.7×; the architectural result is the **read count: 10 001 → 1**. The wall
clock is dominated by the `readdir`+`lstat` walk (~45 ms for 10 001 entries), which is a syscall
floor, not hashing. That matters because the ratio holds as files get *larger*: hashing 40 MB is
what disappeared, and it disappears completely regardless of file size. The cold pass is slower
because it also builds the Merkle tree and the metadata cache — paid once per process.

Per verifying turn (v0.2.2 triggered ~10 full passes): **0.79 s → 0.05 s**.

### C2 — Storage v2

10 000 sequential `save()` calls, one appended message each.

| Transcript length | v0.2.2 per save | Phase 0 per save |
|---|---|---|
| 500 | 1.11 ms | 0.082 ms |
| 1 000 | 2.18 ms | 0.076 ms |
| 2 000 | 4.35 ms | 0.073 ms |
| 4 000 | 8.64 ms | 0.075 ms |
| 10 000 | *(18 s already spent; not run)* | **0.074 ms** |

| | v0.2.2 | Phase 0 |
|---|---|---|
| total for 4 000 saves | **17.8 s** | 0.36 s |
| total for 10 000 saves | ~111 s (extrapolated, n² scaling) | **0.90 s** |
| transcript writes for 10 000 saves | **50 005 000** = n(n+1)/2 | **10 000** |
| growth 500 → 4 000 | **7.8×** (13.1× on a slower run) | **0.91×** (flat) |

Bounded reads on the same database, over 10 000 evidence rows: `record()` 0.16 ms, `count()`
0.50 ms, `tail(50)` with a JSON filter 0.53 ms, `header()` 0.64 ms, `page(50)` 0.78 ms. `list()`
(whole projection) **21.2 ms** — retained deliberately, see
[§3.2](#32-c2--append-only-log--projections).

---

## 3. Architectural decisions

### 3.1 C1 — The fingerprint algorithm did not change

`inventoryFingerprint` is still `sha256` over `path + hash` pairs in sorted order. This was a hard
constraint, not an accident: the fingerprint is the *identity of a proof*. `CompletionPolicy`
compares evidence against `fingerprint(now)`; if the algorithm changed, every pre-existing piece of
evidence in every existing ledger would silently become stale, and the audit trail would fork.

The Merkle root (`treeHash`) is therefore **additive metadata**, never the proof identity. It exists
to answer "which subtrees changed?" in O(depth), not to replace the flat digest.

The benchmark asserts equality against a verbatim v0.2.2 reimplementation on every run, for both an
empty and a non-empty `generatedPaths` list. That is the regression guard: a future optimisation
that drifts the fingerprint fails the benchmark, not a user's session six months later.

### 3.2 C2 — Append-only log + projections

Schema v2 splits what v1 conflated:

```
sessions(id, version, messages, data)      -- header only; transcript removed from the blob
session_messages(session_id, position, data) WITHOUT ROWID
session_events(seq AUTOINCREMENT, session_id, kind, ref, ts)   -- append-only ledger
<typed tables>                              -- projections: latest state per record
```

`session_events` stores **envelopes only** — never a second copy of a payload. One write costs a few
bytes, and `seq` gives `timelineView` a durable cursor: persist it, restart the process, pass it
back, and the stream resumes with no gaps and no repeats (asserted in
`test/storage-v2.test.ts`).

**`list()` was kept.** It reads a whole projection, which is exactly right for `CompletionPolicy`:
it must evaluate *all* evidence and *all* actions before authorizing `COMPLETE`. Replacing that with
a paginated read would mean the authorizer reasons about a subset of the record — precisely the
failure mode Nexus exists to prevent. Bounded reads were introduced for the callers that only ever
wanted one row or the tail: `recordWriteIntent`, the output tool, the executor's catch block,
`resolveAction`, `git/rollback`, `session/inbox`, `context/manager`, `context/memory`.

**The append fast path is guarded, and falls back rather than guessing.** `save()` compares the
in-memory length against the persisted count and verifies the boundary message; if either disagrees
it deletes and rewrites the transcript. Correctness over speed. Truncation and branching both take
the slow path and stay correct.

*Known limitation, deliberately accepted:* an in-place edit to a message *strictly before* the
boundary would not be detected, because detecting it requires reading the prefix — which is the O(n)
cost being removed. This is safe today because the transcript is append-only at every site
(`agent-loop`, `recovery` and `inbox` only push; context compaction advances `epochStart` instead of
rewriting) — audited and documented in `sqlite.ts`. A future caller that genuinely needs to rewrite
history should take the explicit slow path.

### 3.3 C3 — Two classes of anchor

The v0.2.2 hole was structural, not a typo: `changedAssets()` re-hashed the anchors recorded at
admission. A harness file that *did not exist* at admission had no recorded hash, so it was
invisible forever. An agent could create `conftest.py`, `pytest.ini` or `.github/workflows/ci.yml`,
neutralize the failing assertion, and collect a real exit code `0` as proof.

Naively forbidding all new test-shaped files would break the thing Nexus most wants to encourage:
adding regression tests. So the manifest distinguishes:

- **`exclusive`** — harness and build configuration. Introducing one **is** a violation:
  `package.json`, lock files, `tsconfig*`, vitest/jest/playwright/cypress/mocha/eslint/biome/babel
  configs, `pyproject.toml`, `setup.cfg`, `pytest.ini`, `tox.ini`, `conftest.py`,
  `sitecustomize.py`, `requirements*.txt`, `Cargo.*`, `go.mod`, `*.csproj`, `pom.xml`,
  `build.gradle*`, `Gemfile*`, `Makefile`, `justfile`, `Taskfile*`, `Dockerfile*`,
  `docker-compose*`, `.github/**`, `.gitlab-ci.yml`, `.circleci/**`, `trust.manifest.json`.
- **`extensible`** — existing tests. *Editing* one is a violation; **adding a new one is allowed**:
  `**/test/**`, `**/tests/**`, `**/*.test.*`, `**/*.spec.*`, `**/test_*.py`, `**/*_test.go`.

A project may widen or narrow this with a root `trust.manifest.json`. It is read **once, at
admission**, then pinned into the contract — and the file is itself an exclusive anchor, so an agent
cannot widen its own trust boundary mid-session by rewriting it.

Three more properties are load-bearing:

1. **Anchors are always content-read.** They are passed to `inventory()` as an explicit `anchors`
   set and bypass the C1 metadata cache entirely. The proof chain must not depend on `mtime` being
   honest. The metadata key also includes `ctime`, `ino` and `dev`, so a `touch -r` style forgery
   (same size, restored mtime) is still detected — asserted in `test/workspace-index.test.ts`.
2. **Trust is evaluated once per check, after the process exits**, against the revision's pinned
   hashes rather than against the previous run. That covers tampering both before and during the
   run in a single comparison.
3. **Restoring trust requires a human.** `trustChecks` bumps the contract revision *before*
   re-establishing the manifest, so a violation cannot be laundered by re-running the check.

Detection, not prevention: the agent may still change a harness. It simply cannot prove anything
afterwards. Verdicts become `unknown` with an explicit `unknownReason`, and `CompletionPolicy` —
still the sole authorizer — refuses `COMPLETE`.

### 3.4 C4 — Ports only, but load-bearing

No Docker, per scope. `SandboxProvider` reports **capabilities**, and `LocalSandboxProvider`
declares them honestly:

```ts
{ filesystemIsolation: false, networkIsolation: false, pathScopeEnforced: false }
```

Every `ExecutionResult` carries `enforced`, which is recorded in evidence metadata as
`sandbox: {...}`. A verdict therefore states *what isolation it was obtained under* — so evidence
produced today, unsandboxed, cannot later be mistaken for evidence produced under isolation.

The seam is wired through the real execution paths (`bash` tool, `VerificationEngine`) rather than
left as an unused interface. An interface nothing calls is not a seam; it is a comment. A future
`DockerSandboxProvider` is a constructor argument to `createNexus`, nothing more.

---

## 4. Regression tests

16 new tests across 3 files. The three required by the brief, plus the supporting coverage each one needs to be meaningful.

### Test 1 — `test/workspace-index.test.ts` (6 tests)

> *10 000 files, one change → no full project rehash.*

Builds a real 10 000-file workspace and asserts the read counters directly:

| Pass | asserted `stats.reads` |
|---|---|
| cold | `10000` |
| unchanged | `0` |
| after editing `pkg7/mod3.ts` | `1`, and `changed === ["pkg7/mod3.ts"]` |

Plus: Merkle recomputation is local (`2` directories of 201 for a flat edit; `4` for a depth-4 chain
among 50 siblings — the chain, not the tree); a same-size edit with a restored `mtime` is still
detected; trust anchors are re-read on every pass whatever their metadata says; the completion
fingerprint is unchanged and stable across passes; a 9 MiB file taking the streaming path produces
the identical sha256 to a one-shot read; one index is reused per workspace and released explicitly.
**Runtime: 1.3 s.**

### Test 2 — `test/storage-v2.test.ts` (6 tests)

> *10 000 events → no O(N²).*

The load-bearing assertion is **structural, not a timing**: 10 000 saves must perform exactly
10 000 transcript writes, counted from the ledger. v0.2.2 performed `sum(1..10000) = 50 005 000`.
A CI machine can be slow; it cannot make that number small. Timing is kept as a loose secondary
guard (last-decile median < 4× first-decile median).

Also covers: ledger sequence numbers strictly increasing and unique; transcript survives reload and
pages correctly; `header()` returns no transcript; truncation and branching take the full-rewrite
fallback and stay correct, and appending resumes the fast path afterwards; bounded reads (`count`,
`page`, `tail`, `tail` with a JSON filter, `record`) agree with `list()` over 600 rows; the timeline
cursor yields no gaps and no repeats and hydrates payloads only for requested kinds; and a **v1 → v2
migration** built from the verbatim v0.2.2 schema keeps sessions, transcripts and records, drops the
redundant `messages` table, and continues on the v2 append path. **Runtime: 1.2 s.**

### Test 3 — `test/trust-manifest.test.ts` (4 tests)

> *Trust Manifest: pytest config changed → `COMPLETE` is forbidden.*

1. **`modified`** — agent applies the *real* fix to `add.ts`, then edits `pytest.ini`. The goal
   check genuinely exits `0`. Asserted: `pytest.ini` was pinned at admission; the fix landed; some
   evidence has `exitCode === 0`; **no** evidence has `verdict: "pass"`; a violation
   `{ path: "pytest.ini", kind: "modified" }` is recorded; `status !== "COMPLETED"` and
   `outcome !== "COMPLETE"` with a non-empty reason.
2. **`introduced`** — the v0.2.2 hole. Agent applies the real fix, then creates a `conftest.py` that
   never existed. Asserted: nothing was pinned for it (`protected["conftest.py"]` undefined, and it
   appears in `absent`); the check still exits `0`; a violation `{ kind: "introduced" }` is
   recorded; `COMPLETE` is refused.
3. **Extensible, allowed** — agent applies the real fix and adds a **new** `add.test.ts`. Asserted:
   zero violations, `verdict: "pass"`, `outcome === "COMPLETE"`, `status === "COMPLETED"`. Adding
   regression tests must never be punished.
4. **Guard unit behaviour** — discovery pins `pytest.ini` and `scenario.ts` and records the runner;
   a same-length content change is `modified`; deletion is `deleted`; and the exclusive/extensible
   classification is asserted directly (`conftest.py` and `.github/workflows/ci.yml` exclusive;
   `test/add.test.ts` extensible-only; `src/add.ts` not an anchor).

### Suite

```
bun test ./test     142 pass / 3 skip / 0 fail   (baseline 126 / 3 / 0)   6.6 s
bun run check       typecheck · boundaries · test · bench · build · smoke · product  →  7/7 PASS
```

The 3 skips are pre-existing (real PowerShell, not present on Linux). `bench/run.ts` still reports
`false_completion: false` on all three scenarios, including `addition-false-done`.

---

## 5. Bugs found during implementation

Both were found by measurement, not by review, and both would have shipped silently.

### 5.1 `save()` read its own write — the quadratic cost survived the rewrite

The first Storage v2 implementation computed `persisted = messageCount(id)` **after** the header
`UPDATE`. The `UPDATE` had already written the *new* length, so `persisted` always equalled
`conversation.length`, `boundaryMatches` always compared the wrong position and always failed, and
every save took the full-rewrite path.

Consequence: the new code was *slower than the code it replaced* — 99.9 ms per save at 10 000
messages. The tests were green, the schema was correct, and the architecture diagram was right. Only
the benchmark caught it. Fix: capture `persisted` and `appendOnly` before the `UPDATE`. That single
reordering is the difference between 0.96 s and ~120 s for a 10 000-message session.

*Lesson recorded in the plan and honoured here:* a performance change without a benchmark in the
same commit is a guess.

### 5.2 `withinScope()` treated the workspace root as outside itself

`workspacePolicy()` denies `<workspace>/.git`. `withinScope()` compared paths with
`path.relative()` and checked for a `..` prefix — but missed the case where `relative` is *exactly*
`".."`. The workspace root resolves to `".."` relative to a child deny entry, so the deny rule for
`.git` denied the workspace itself. 22 tests failed the moment the sandbox seam went live.

Fix: `relative !== ".."` alongside the prefix check. Worth stating plainly: this is the class of bug
that makes a sandbox a liability. A path-scope predicate that is wrong at the boundary is worse than
no path scope, because callers trust it.

---

## 6. Compatibility

- **Databases migrate in place.** `PRAGMA user_version` 1 → 2 inside one immediate transaction:
  either the whole upgrade commits or the file is untouched. The redundant `messages` table is
  dropped only after its authoritative copy (the session blob) has been transcribed. Covered by a
  test built from the verbatim v0.2.2 schema.
- **Pre-Phase-0 sessions keep working.** `Contract.trustManifest` is optional; when it is absent,
  `trustViolations()` falls back to comparing `contract.protectedFiles`, which is exactly v0.2.2
  behaviour. An in-flight session resumed after the upgrade does not change verdicts.
- **`Store` grew, it did not change.** `Range`, `TailFilter`, `LedgerEntry`, `header`, `headers`,
  `record`, `count`, `page`, `tail`, `messageCount`, `messages`, `ledger` are additive. Every
  v0.2.2 method keeps its signature and semantics.
- **Existing evidence stays valid.** The fingerprint algorithm is byte-identical, so no stored
  evidence becomes stale as a result of this change.
- **`ToolExecutor` takes a third argument** (`SandboxProvider`) — the only source-breaking change,
  confined to construction. `createNexus` defaults it to `LocalSandboxProvider`.
- **Scan ceiling raised** from 20 000 to 200 000 files, now that a pass is not a full rehash.
- **The 32 MiB per-file fail-closed limit was replaced, not removed.** v0.2.2 aborted the whole
  fingerprint if any single file exceeded 32 MiB, because it read files into one buffer. Files above
  8 MiB are now hashed as a stream, which yields the identical sha256 (asserted in
  `test/workspace-index.test.ts`) and is read at most once per change. `docs/ROADMAP.md` was
  corrected to match.

---

## 7. What Phase 0 does not do

Named explicitly so nothing here is mistaken for finished work.

- **No real isolation.** C4 is ports plus an honest local provider. Until a
  `DockerSandboxProvider` exists, `pathScopeEnforced` is `false` and every verdict says so.
- **No index persistence across processes.** The C1 cache is in-memory and per-process; the first
  pass in a fresh process is cold (162 ms for 10 001 files). Persisting it to `.nexus/` is a
  follow-up, and needs care: a persisted cache is an attack surface, so anchors must keep bypassing
  it.
- **In-place rewrites of persisted history are out of contract** — see
  [§3.2](#32-c2--append-only-log--projections).
- **`CompletionPolicy` still reads whole projections.** Correct today, and the honest bound on
  session length. When it becomes the ceiling, the fix is an incrementally-maintained projection
  with its own proof — not pagination.
- **`git status` is still shelled out per verification.** Now the dominant fixed cost of a
  verifying turn.
- **The trust pattern list is heuristic.** It covers the JS/TS, Python, Go, Rust, .NET, JVM and Ruby
  ecosystems and CI directories, and is overridable per project — but a project with an unusual
  harness layout should declare it in `trust.manifest.json`.

### Suggested Phase 1 order

1. `DockerSandboxProvider` behind the existing ports — turn `enforced` into `true`.
2. Persist the workspace index to `.nexus/`, anchors still excluded, to kill the cold pass.
3. Replace the per-turn `git status` shell-out with a watched incremental status.
4. Incremental `CompletionPolicy` inputs, only once measurement says it is the ceiling.

---

## 8. Reproducing this

```bash
cd NexusCLI/nexus
bun install
bun run check              # 7/7: typecheck, boundaries, test, bench, build, smoke, product
bun test ./test            # 142 pass / 3 skip / 0 fail
bun run bench:phase0       # C1 + C2 vs a verbatim v0.2.2 oracle, same process
bun run bench:phase0 -- --json
bun test ./test/workspace-index.test.ts ./test/storage-v2.test.ts ./test/trust-manifest.test.ts
```

`bench:phase0` is deliberately **not** in `bun run check`: it allocates a ~40 MB workspace and
writes 10 000 session rows. It fails loudly if the completion fingerprint ever drifts from v0.2.2.
