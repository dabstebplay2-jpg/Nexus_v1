# NEXUS PHASE 0 — FOUNDATION IMPLEMENTATION PLAN

> **Status:** planning complete, awaiting code
> **Version:** v0.2.2 → v0.3.0-phase0
> **Branch:** `nexus-v0.2.1-local-model-fix`
> **Scope:** C1 Incremental Workspace Index · C2 Storage v2 · C3 Trust Manifest · C4 Sandbox Ports
> **Non-scope:** UI, models, new agent features, new tools, rewrites

## 0. Objective

Nexus is a **Verifiable AI Engineering Environment**: `CompletionPolicy` is the only authorizer of
`COMPLETE`, and proof is anchored to *contract revision · source fingerprint · WorkspaceDelta ·
trusted verification · evidence ledger*.

That design is sound. Its **implementation** currently assumes small workspaces and short sessions.
Phase 0 removes those assumptions **without changing the proof semantics**. Every fingerprint that
authorizes completion today must remain byte-identical after Phase 0.

Target after Phase 0: real projects of **10k–50k files** and **multi-hour sessions**.

---

## 1. Current architecture (as measured, not as documented)

Code lives in `NexusCLI/nexus`. `bun` runtime, TypeScript strict, ~3.6k lines of `src`.

```
apps/{cli,server,web,shared}       UI + HTTP/SSE boundary
  |
src/api.ts                         NexusAPI — the only command surface
src/composition.ts                 single composition root
  |
src/core/agent-loop.ts             AgentLoop: RECOVERING→…→VERIFYING→COMPLETED
src/core/state.ts                  transition guard (COMPLETED requires decision.outcome=COMPLETE)
src/completion/policy.ts           CompletionPolicy — sole COMPLETE authorizer
src/verification/engine.ts         trusted checks, frozen at admission
src/verification/delta.ts          WorkspaceDelta + inventory + inventoryFingerprint
src/verification/integrity.ts      trust anchors (verificationAssets / changedAssets)
src/recovery/policy.ts             inspect-only recovery, never replays
src/context/{manager,memory,budget,tokens}.ts   L0/L1/L2/L3 context
src/storage/{sqlite,migrations}.ts SQLite persistence (user_version=1)
src/tools/{registry,executor,builtin,workspace,process,platform}.ts
src/permissions/engine.ts          capability rules + command classification
src/domain/{types,ports}.ts        types + Store/Provider/TokenCounter ports
```

Baseline health on this branch: **126 pass / 3 skip / 0 fail** (`bun test ./test`, 3.9 s).

### 1.1 How a fingerprint is produced today

`src/tools/workspace.ts`
```
files(workspace)      -> recursive readdir, hard cap 20000 files, throws PROJECT_LIMIT above it
hashFile(file)        -> sha256 of full file contents
fingerprint(ws)       -> readdir all + read+hash every file
```
`src/verification/delta.ts`
```
inventory(ws, gen)    -> git ls-files (or files()) + read+hash EVERY candidate file
inventoryFingerprint  -> sha256 over sorted (path, hash) pairs
compare(before,after) -> created / modified / deleted / sourceChanges / learned
```

### 1.2 Where full rehashes are triggered per turn

| Call site | File | Full workspace hash passes |
| --- | --- | --- |
| `sourceFingerprint()` before verification | `core/agent-loop.ts:262` | 1 |
| `sourceFingerprint()` for the decision | `core/agent-loop.ts:271` | 1 |
| `sourceFingerprint()` for answer evidence | `core/agent-loop.ts:255` | 1 (answer mode) |
| `inventory()` before each check | `verification/engine.ts:42` | 1 × checks |
| `inventory()` after each check | `verification/engine.ts:64` | 1 × checks |
| `changedAssets()` per check | `verification/engine.ts:65` | anchors × checks |
| `verificationAssets()` | `composition.ts:114`, `trustChecks` | 1 per session / per trust review |

A verifying turn on a 4-check Node project performs **≈10 full content-hash passes of the entire
workspace**.

### 1.3 How a session is persisted today

`src/storage/sqlite.ts` — `sessions(id, version, data)` holds the **whole session as one JSON blob**,
including the complete `conversation`. On every `save()`:

1. `JSON.stringify(session)` — serializes the entire transcript, and
2. `session.conversation.forEach(... project("messages", ...))` — **re-writes every message row**.

`save()` is called on every message append, every tool result, every state transition.

`list(table, sessionId)` loads and `JSON.parse`s **all** rows for a session. It is called
repeatedly per turn — including `recordWriteIntent` (`tools/builtin.ts:237`), which does
`store.list("actions", …).find(…)` for a single row, and `taskMemory`
(`context/memory.ts`), which lists all actions and evidence on every context build.

---

## 2. Problems, with measurements

Measured in this sandbox: synthetic workspace of **10 000 files** and a session driven to
**4 000 messages**.

### C1 — Fingerprint does not scale (`O(files × turns)`)

```
inventory() cold                 :  74 ms  (10 000 paths)
inventory() again, nothing changed:  53 ms   <- identical work, zero reuse
inventory() after editing 1 file  :  45 ms   <- 1 file changed, 10 000 files rehashed
inventoryFingerprint()            :   6 ms   <- CPU-only, negligible
```

Two conclusions:

1. **Zero reuse.** An unchanged workspace costs exactly as much as a cold one.
2. **The cost is I/O, not hashing.** The set-hash is 6 ms; reading file contents is the rest.
   The synthetic fixture uses 220-byte files. A real 10k-file repository averaging 8 KB/file must
   read **~80 MB per pass**, ~10 passes per verifying turn — hundreds of MB of redundant reads per
   turn, growing linearly with repository size.

Secondary defects found while reading the code:

- `files()` throws `PROJECT_LIMIT` above **20 000** files. A 50k-file target is *currently
  impossible by construction*, not merely slow.
- `fingerprint()` throws `PROJECT_LIMIT` for any file > 32 MiB, so one large asset makes a
  repository unverifiable.
- `verificationAssets()` walks the whole tree to find trust anchors.

### C2 — Storage is quadratic

```
save() @  500 messages :  1.5 ms
save() @ 1000 messages :  3.7 ms
save() @ 2000 messages :  7.0 ms
save() @ 3000 messages : 13.0 ms
save() @ 4000 messages : 17.7 ms
growth 500 -> 4000     : 11.5x        (linear would be 1x, quadratic ≈ 8x)
total for 4000 saves   : 37.2 s
```

Per-save cost grows with transcript length, so total session cost is `O(N²)`. Both halves of the
loop contribute: re-serializing the blob **and** re-projecting every message row. A multi-hour
session degrades until it is unusable, and the degradation is silent.

`list()` has no pagination, no cursor, and no single-row read, so hot paths pay `O(rows)`
`JSON.parse` repeatedly.

### C3 — Trust anchors are not reliably pinned

`verificationAssets()` snapshots hashes of files matching a regex (package.json, tsconfig\*,
pytest\*, vitest/jest, `*.test.*`, `test_*.py`, Cargo.toml, go.mod, plus files named in check argv).
`changedAssets()` re-hashes **only the paths already in that snapshot**.

The hole: **a protected file that did not exist at admission is invisible forever.**

- Workspace has no `conftest.py` → agent creates one that stubs the failing assertion → not in
  `protectedFiles` → not checked → `pytest` exits 0 → evidence `pass` → `COMPLETE`.
- Same for a new `pytest.ini`, `tox.ini`, `.github/workflows/ci.yml`, `Makefile`, `jest.config.js`,
  `vitest.config.ts`, `sitecustomize.py`, `.npmrc`.

Additional gaps: the anchor set is implicit (a regex in code, not reviewable), it is not persisted
anywhere a human can read or diff, and the patterns miss `pyproject.toml`, `setup.cfg`, `tox.ini`,
`Makefile`, `.github/**`, `eslint`/`biome`/`ruff` configs, and lockfiles.

### C4 — Execution is not isolated

`tools/process.ts` → `Bun.spawn` directly on the user's machine. `PermissionEngine` decides
*whether* to run; nothing constrains *what a running process can reach*. Path scope, network
policy, and filesystem confinement have no representation in the type system, so there is no seam
to add them later without touching every call site.

---

## 3. Design

### 3.1 C1 — Incremental Workspace Index

```
Workspace
   |
   +-- WorkspaceIndex           refresh() -> { root, files, changed, stats }
         |
         +-- MerkleTree         directory hashes; one file edit repairs one root-path
         |
         +-- FileHashCache      path -> { size, mtimeMs, ctimeMs, ino, hash }
         |
         +-- probe              lstat only; content read ONLY on cache miss
```

**Invalidation key.** A cached content hash is reused only when `size`, `mtimeMs`, `ctimeMs`, `ino`
and `dev` all match. `ctimeMs` matters: `touch -r` can forge `mtime`, but on Linux/macOS any write
or metadata change bumps `ctime`, and it cannot be set by an unprivileged process. This keeps the
cache a *performance* optimization that does not weaken the security property.

**Trust anchors are never cached.** Files in the Trust Manifest are always content-hashed. The
integrity of `COMPLETE` therefore never depends on filesystem metadata. This is the single most
important rule in C1.

**Merkle tree.** `dirHash = sha256(sorted(name + ":" + childHash + "\n"))`. Editing one file
recomputes hashes only along its ancestor chain: `O(changed × depth)` instead of `O(files)`. The
root hash is exposed as `treeHash` for cheap "did anything at all change?" and directory-level
change attribution.

**Fingerprint compatibility — non-negotiable.** `inventoryFingerprint` keeps its current algorithm
(sha256 over sorted `path + hash`) **byte-for-byte**. Evidence rows persisted by v0.2.2 store these
values, and `completionPolicy` compares them by equality. Changing the algorithm would silently
invalidate every stored proof. The Merkle root is *additive metadata*, not the identity.
Measured cost of keeping it: 6 ms per pass, against 45–2000 ms saved.

**Scale limits.** `files()` cap 20 000 → 200 000 (configurable), and the >32 MiB hard failure
becomes a recorded `oversize` entry hashed by `size+mtime+ctime+ino` rather than a
`PROJECT_LIMIT` throw. A large binary must not make a repository unverifiable.

**Compatibility surface.** `inventory()`, `inventoryFingerprint()`, `compare()`, `isGenerated()`,
`files()`, `hashFile()`, `fingerprint()` keep their exact signatures and semantics. The index is
injected behind them, so `agent-loop`, `verification/engine` and `composition` change only where
they *pass the index through*.

New files:
```
src/workspace/index/cache.ts        FileHashCache + metadata probe + invalidation key
src/workspace/index/merkle.ts       directory hashing, subtree invalidation, root hash
src/workspace/index/fingerprint.ts  WorkspaceIndex: refresh/snapshot/fingerprint/changed
src/workspace/index/scan.ts         bounded walk that reuses directory entries
```

### 3.2 C2 — Storage v2 (append-only events + projections)

```
append-only ledger                        projections (derived, rebuildable)
------------------                        ---------------------------------
session_events                            session_view    header + counters
  seq  (stable, monotonic)                evidence_view   paginated, cursor
  session_id                              timeline_view   merged ordered stream
  kind
  data
  ts
```

**Rule.** Appends are `O(appended)`. Nothing rewrites history. Every read is either a single row,
a bounded page, or an explicit full scan the caller asked for.

Changes:

1. **Session header, not session blob.** The `sessions` row stores the session *without*
   `conversation`, plus `message_count`. `save()` no longer serializes the transcript.
2. **Transcript is append-only.** `save()` appends only messages at index ≥ the persisted
   watermark. Verified append-only in the current code: `agent-loop`, `recovery/policy` and
   `session/inbox` only `push`; `context/manager` compacts by moving `epochStart` forward and never
   rewrites a stored message. A boundary check (count + last persisted message digest) detects any
   violation and falls back to a full rewrite — correctness over speed.
3. **Stable sequence numbers + durable cursor.** `session_events.seq` is monotonic per database.
   `timeline(sessionId, { afterSeq, limit })` is resumable, which the SSE/HTTP layer needs anyway.
4. **Lazy transcript loading + pagination.** New `Store` methods, all additive:
   ```
   record(table, id)                    single row, replaces list(...).find(...)
   count(table, sessionId)              cheap counter
   page(table, sessionId, {offset,limit})
   tail(table, sessionId, n)            for taskMemory's slice(-k) patterns
   messages(sessionId, {offset,limit})  paginated transcript
   appendMessages(sessionId, messages)
   events(sessionId, {afterSeq,limit})  durable cursor
   ```
   `list()` stays, unchanged, so no existing caller breaks.
5. **Hot-path fixes.** `recordWriteIntent`, the `output` tool and `resolveAction` switch to
   `record()`. `taskMemory` switches to `tail()`. These are the `O(N)`-per-tool-call costs.
6. **Migration `user_version` 1 → 2.** For each existing session: parse the blob, append its
   conversation into `messages` with stable seq, set the watermark, store the stripped header.
   Idempotent, transactional, and reversible by keeping the original blob column until the
   transaction commits. `version > 2` still throws.

### 3.3 C3 — Trust Manifest

```
src/verification/trust/manifest.ts   TrustManifest type, default protected patterns
src/verification/trust/discover.ts   build a manifest from a workspace
src/verification/trust/file.ts       read/write trust.manifest.json (reviewable, diffable)
src/verification/trust/guard.ts      evaluate(manifest, workspace) -> violations
```

`trust.manifest.json`, written at the workspace root:
```json
{
  "version": 1,
  "generatedAt": "...",
  "contractRevision": 1,
  "patterns": ["package.json", "tsconfig*.json", "pytest.ini", "conftest.py", ".github/workflows/**", "..."],
  "protected": { "package.json": "<sha256>", "pytest.ini": "<sha256>" },
  "absent": ["conftest.py", "pytest.ini", "tox.ini", "jest.config.js"]
}
```

The `absent` list is the fix for C3. The guard reports three violation kinds:

| Kind | Meaning |
| --- | --- |
| `modified` | a protected file's hash changed |
| `deleted` | a protected file disappeared |
| `introduced` | a **new** file matching a protected pattern appeared |

`trust.manifest.json` protects itself (it is in its own `protected` set), and
`src/tools/workspace.ts#guard` already blocks agent writes to `.git`/`.nexus`; the manifest is
additionally covered by `introduced`/`modified`.

Protected patterns cover: Node (`package.json`, lockfiles, `tsconfig*`, `vitest|jest|eslint|biome`
configs), Python (`pyproject.toml`, `setup.cfg`, `setup.py`, `pytest.ini`, `tox.ini`, `conftest.py`,
`sitecustomize.py`, `requirements*.txt`), Rust (`Cargo.toml`), Go (`go.mod`), .NET (`*.csproj`,
`*.sln`), build/CI (`Makefile`, `.github/**`, `.gitlab-ci.yml`, `Dockerfile`), plus every file named
in a check's `argv`.

Integration in `VerificationEngine.run()`, before each check:

```
1. refresh the workspace index (incremental)
2. evaluate the trust manifest
3. if violations -> evidence.verdict = "unknown", metadata.trustViolations = [...]
   -> CompletionPolicy already turns two unknowns into Decision.outcome = "UNKNOWN"
   -> COMPLETE is impossible until a human runs trust-checks (which bumps contract.revision)
```

`contract.protectedFiles` keeps being populated, so v0.2.2 sessions and the existing
`changedAssets` behaviour continue to work. The manifest is a strict superset.

### 3.4 C4 — Sandbox ports only (no Docker)

```
Agent
  |
  v
PermissionEngine        may this capability run?          (exists)
  |
  v
ExecutionPolicy         where, for how long, what env?    (new, declarative)
  |
  v
SandboxProvider         run it                            (new port)
  |
  +-- LocalSandboxProvider   wraps today's Bun.spawn, behaviour unchanged
  +-- (future) ContainerSandboxProvider / WindowsJobObjectProvider
  |
  v
Workspace
```

```
src/sandbox/ports.ts    SandboxProvider, ExecutionPolicy, NetworkPolicy,
                        ExecutionRequest, ExecutionResult, SandboxCapabilities, PathScope
src/sandbox/policy.ts   default policies + validation (path scope, timeouts, env allowlist)
src/sandbox/local.ts    LocalSandboxProvider — delegates to tools/process.ts
```

Wired into `composition.ts` as the default provider so the port is exercised, not dead code.
`SandboxCapabilities` declares honestly what a backend actually enforces
(`filesystemIsolation: false`, `networkIsolation: false` for local), so no layer can mistake the
local runner for a sandbox. **No container implementation in Phase 0.**

---

## 4. Files touched

### New
```
src/workspace/index/cache.ts
src/workspace/index/merkle.ts
src/workspace/index/fingerprint.ts
src/workspace/index/scan.ts
src/storage/events.ts
src/storage/projections.ts
src/verification/trust/manifest.ts
src/verification/trust/discover.ts
src/verification/trust/file.ts
src/verification/trust/guard.ts
src/sandbox/ports.ts
src/sandbox/policy.ts
src/sandbox/local.ts
test/workspace-index.test.ts        Test 1
test/storage-v2.test.ts             Test 2
test/trust-manifest.test.ts         Test 3
bench/phase0.ts                     reproducible benchmark
```

### Modified (surgical)
```
src/domain/ports.ts             additive Store methods; WorkspaceIndex + Sandbox port types
src/domain/types.ts             Contract.trustManifest (optional, backward compatible)
src/storage/sqlite.ts           header/blob split, append-only messages, paged reads
src/storage/migrations.ts       user_version 1 -> 2
src/tools/workspace.ts          files() cap, oversize handling, index-backed fingerprint
src/verification/delta.ts       inventory() reuses the index; algorithm unchanged
src/verification/integrity.ts   delegates to trust/, keeps its exported signatures
src/verification/engine.ts      trust guard before each check
src/core/agent-loop.ts          reuse one index per run instead of rescanning
src/composition.ts              construct index + manifest + sandbox provider
src/tools/builtin.ts            recordWriteIntent/output -> record()
src/context/memory.ts           taskMemory -> tail()
docs/ARCHITECTURE.md            document Phase 0 layers
docs/VERIFICATION.md            document the Trust Manifest
```

### Explicitly untouched
```
src/completion/policy.ts        CompletionPolicy semantics
src/core/state.ts               transition guard
src/domain/ports.ts#Provider    provider interface
src/recovery/policy.ts          inspect-only recovery
apps/**                         UI, HTTP, web
```

---

## 5. Migration sequence

Each step lands green (`bun test ./test` + `bun run typecheck` + `bun run check:boundaries`).

| # | Step | Gate |
| --- | --- | --- |
| 1 | Benchmark harness `bench/phase0.ts`, record baseline | numbers reproduced |
| 2 | `workspace/index/*` behind the existing signatures | 126 pass unchanged |
| 3 | `inventory()`/`fingerprint()` use the index | fingerprints byte-identical |
| 4 | Test 1: 10k files, one edit → bounded rehash | new test green |
| 5 | Additive `Store` methods + hot-path callers | 126 pass unchanged |
| 6 | Header/blob split + append-only messages + migration v2 | old DB opens and runs |
| 7 | Test 2: 10k events, no `O(N²)` | new test green |
| 8 | `verification/trust/*` + guard in the engine | anchor tests still green |
| 9 | Test 3: pytest config change → COMPLETE forbidden | new test green |
| 10 | Sandbox ports + local provider + composition wiring | boundaries green |
| 11 | Full `bun run check`, benchmarks, report | all green |

**Rollback:** steps 2–4 and 8–10 are additive and revert cleanly. Step 6 is the only irreversible
one; it is guarded by the `user_version` gate, runs in one transaction, and is covered by an
old-database-opens test.

---

## 6. Risks

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | Fingerprint algorithm drift invalidates stored evidence | **critical** | `inventoryFingerprint` unchanged; a test asserts a fixed expected digest |
| R2 | `mtime`-based cache misses a real change → false `COMPLETE` | **critical** | key includes `ctimeMs`+`ino`+`dev`+`size`; trust anchors are **never** cached; index resets per verification run |
| R3 | Storage migration corrupts existing sessions | **critical** | single transaction, `user_version` gate, idempotent, old-DB test |
| R4 | Assuming append-only transcripts when something rewrites one | high | boundary check (count + digest of last persisted message) with full-rewrite fallback |
| R5 | Trust Manifest false positives block legitimate work | medium | `introduced`/`modified` yield `UNKNOWN` with a named path, never silent `FAILED`; human `trust-checks` bumps the revision |
| R6 | Manifest patterns miss an ecosystem's harness | medium | patterns are data in `trust.manifest.json`, reviewable and extensible without code changes |
| R7 | Sandbox ports become dead abstraction | medium | local provider is wired as the default; `SandboxCapabilities` states what is *not* enforced |
| R8 | Merkle tree adds complexity for little gain | low | tree only drives invalidation and `treeHash`; the proof identity does not depend on it |
| R9 | Removing the 20k-file cap exposes memory growth | medium | cache stores fixed-size metadata per path; cap raised, not removed; oversize files are metadata-hashed |
| R10 | Windows path/`ctime` semantics differ | medium | index normalizes to `/`; on Win32 fall back to `size+mtime+ino`, documented; anchors still content-hashed |

---

## 7. Definition of done

1. `bun run typecheck`, `bun run check:boundaries`, `bun test ./test` all green; **126 pre-existing
   tests still pass** with no assertions weakened.
2. **Test 1** — 10 000-file workspace: editing one file rehashes `O(1)` file contents, not 10 000.
3. **Test 2** — 10 000 events: per-operation cost does not grow with history; no `O(N²)`.
4. **Test 3** — changing a pytest config makes `COMPLETE` unreachable (`UNKNOWN`).
5. A v0.2.2 database opens, migrates, and runs.
6. `NEXUS_PHASE0_IMPLEMENTATION_REPORT.md` with before/after benchmarks.
7. `CompletionPolicy`, `AgentLoop`, `Provider` and the verification philosophy are unchanged.
