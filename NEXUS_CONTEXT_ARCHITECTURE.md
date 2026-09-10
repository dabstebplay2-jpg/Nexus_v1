# Nexus Context Architecture

Context is a variable, not a transcript.

This document describes how Nexus assembles the prompt it sends to a model: what it keeps, what it
compresses, what it never sends, how that is observed, and which invariants may not be traded away for
space. It covers `src/context/`, `src/project/knowledge.ts`, `src/tools/router.ts` and
`src/planner/policy.ts`. The Agent Loop, CompletionPolicy, VerificationEngine and Storage are unchanged.

## Current State

Nexus already had substantial context machinery before this iteration. The problem was never "there is no
context management", so nothing below was rewritten:

| Component | File | What it already does |
| --- | --- | --- |
| `ContextManager` | `src/context/manager.ts` | Single assembly point for every provider request; epochs; overflow recovery |
| `contextBudget` / `contextMode` | `src/context/budget.ts` | Window, reserved output, tokenizer pressure multiplier, prepare/compress thresholds |
| `HeuristicTokenCounter` | `src/context/tokens.ts` | Tokenizer-free estimate (3.5 chars/token Latin, wide chars /2, CJK 1) plus a 4-token envelope per message |
| `taskMemory()` | `src/context/memory.ts` | Deterministic, bounded, structured JSON summary built from durable storage, not from model prose |
| `messageGroups()` | `src/context/memory.ts` | Groups a tool call with its result so truncation can never orphan either |
| `context_epochs` | `src/storage/` | Compaction is durable, numbered and replayable after restart |
| `retrieve()` | `src/project/retrieval.ts` | Lexical file retrieval, already exposed as a `retrieve` tool |
| `failureMemory()` | `src/intelligence/memory.ts` | Repeat-failure detection (`REPEAT_LIMIT` 3, `TERMINAL_LIMIT` 5) |
| Workspace index | `src/workspace/index/` | Incremental, hashed, cached traversal with symlink and secret exclusions |

What the prompt actually looked like: a baseline string (instructions + environment + a three-field
project line + contract + AGENTS.md) followed by the last N message groups, with a single fallback ladder
of detail scales. Two tiers, no declared priority, no accounting.

## Problems

1. **The layer model was implicit.** Priority existed only as string concatenation order. Nothing could
   answer "what would be dropped first, and why".
2. **No project memory.** `ProjectContext` was `kind`, `packageManager`, `branch`. Everything else about
   the project had to be rediscovered by the model on every task, with tool calls, every time.
3. **Error memory never reached the prompt.** `failureMemory()` informed the supervisor but was invisible
   to the model, so the model could not learn inside a run what had already failed.
4. **No observability.** `context_budget` reported one number. There was no way to see which categories
   consumed the window, what was excluded, or what compaction actually saved.
5. **Bash as a universal file API.** Small models used `bash cat`, `bash ls`, `bash grep` instead of the
   guarded, hash-returning tools, burning turns and producing unverifiable reads.
6. **Planning silence.** Execution frequently reported "No explicit plan was recorded." Planning was
   neither required for complex mutating work nor waived for trivial questions.
7. **Small windows were second-class.** At 8k the fixed prelude plus tool schemas leaves very little room,
   and the failure mode was an unhelpful capacity error rather than graceful degradation.

## Context Model

Three invariants:

1. **One assembler.** `ContextManager.build()` is the only place a provider request is constructed. There
   is no second prompt path, and no subsystem may append to the prompt behind its back.
2. **Evidence is never prose.** Verification evidence, source hashes and completion state live in storage
   and are read by CompletionPolicy directly. A summary is an aid to the model, never a proof. Compaction
   therefore cannot damage completion correctness, only model recall.
3. **Degradation is ordered, bounded and observed.** Under pressure Nexus drops the cheapest layer first,
   records exactly what it dropped, and never silently discards pinned context.

Assembly order (highest priority first):

```
L0  instructions + environment + routing guidance + planning guidance + AGENTS.md
L0  contract (revision, mode, criteria, checks)
L0  tool schemas
L3  project knowledge blocks            <- discretionary, allocated
L2  task memory (findings/decisions/failures/files)
L1  live message groups at the current detail scale
L4  archive                             <- never sent
```

L0 is pinned: removing any of it does not make the prompt smaller in a useful way, it makes the run
unsound. L4 is never sent by construction; it is reachable only through the `history` and `output` tools.

## Memory Layers

`src/context/layers.ts` declares the layers and the allocation policy.

| Layer | Contents | Lifetime | Resent each turn |
| --- | --- | --- | --- |
| `L0_CRITICAL` | System instructions, security framing, environment, routing and planning guidance, contract, tool schemas, `AGENTS.md` | Whole session | Always |
| `L1_WORKING` | Current exchange: recent message groups, current tool call and result, current errors | Current epoch | Always, at a detail scale |
| `L2_TASK_MEMORY` | `taskMemory()`: findings, decisions, attempted approaches, failures, active files, open questions | Whole session, rebuilt from storage | Always, at a detail scale |
| `L3_PROJECT` | `ProjectKnowledge`: stack, entry points, source roots, tests, commands, dependencies, conventions | Cached per workspace | Only if it fits the L3 allocation |
| `L4_ARCHIVE` | Old turns, superseded tool outputs, verbose logs | Durable, forever | Never |

`allocate(blocks, budget, stage)` admits every pinned block first, in input order, then walks the layers
in priority order giving each a share of what is left. A block that does not fit its layer share is
excluded rather than truncated, so the model never receives half a fact. If pinned context alone exceeds
the budget the shortfall is reported as `overflow` instead of being hidden.

A `workingFloor` of 0.35 of the limit is withheld from allocation entirely. Optional knowledge is admitted
only from what remains, never from the working set: a prompt that fits only because project knowledge
displaced the current tool result is not a smaller prompt, it is a blind one.

## Compaction

Thresholds (`compactionThresholds`) are measured with `budgetUtilisation()`: the fraction of the
*admissible* input budget a prompt occupies. `limit` already has the output reservation and tokenizer
pressure divided out, so this reaches exactly 1 when a prompt fills the budget.

This is deliberately **not** the window fraction. `contextBudget` defines
`limit = (window * 0.9 - output) / pressure`, so `contextUtilisation()` saturates at 0.9 by
construction and a 0.95 emergency threshold on that scale could never fire. An unreachable emergency
stage is worse than no emergency stage. The budget's own `prepare` and `compress` modes still sit above
these stages as the last-resort provider guard:

| Stage | Utilisation | Effect |
| --- | --- | --- |
| `normal` | below 0.70 | Full detail, all layers eligible |
| `soft` | 0.70 | Enter the ladder one step down; L3 share reduced |
| `hard` | 0.85 | Task memory and old observations compressed; L3 nearly closed |
| `emergency` | 0.95 | Minimum viable working context; L3 share is 0 |

The stage selects the entry point into `detailScales = [1, 0.65, 0.35, 0.15]`, which control task-memory
detail, how many message groups are kept, and per-message bounds. Crucially the stage is computed **after**
epoch compaction, so a session that has just been compacted and now fits comfortably is rendered at full
detail again rather than being punished for its history.

Epoch compaction itself is unchanged: `compact()` advances `session.epoch`, moves `epochStart`, writes a
durable row to `context_epochs` and emits `context_compressed`. Compaction moves history to L4; it never
deletes it. `recoverOverflow()` still raises tokenizer pressure by 1.3x (capped at 3) and recompacts when a
provider rejects a request, tolerating four such failures.

Never dropped, at any stage: the goal, the contract, the security framing, the current plan requirement,
verification state, unresolved errors, source hashes, and pending permissions. These are all pinned L0 or
live in storage outside the prompt.

## Retrieval

Retrieval is lexical and structured. There is no vector database, and none is needed yet.

The selection chain is:

```
current goal + intent
  -> project knowledge (stack, entry points, source roots, commands)
  -> lexical file retrieval (src/project/retrieval.ts, already exposed as the `retrieve` tool)
  -> recorded failures for this task (src/intelligence/memory.ts)
  -> prompt
```

The reasoning is deliberate. A local-first, single-user agent operating on one workspace has a small
candidate set, exact identifiers to match on, and a filesystem that is already indexed and hashed.
Lexical matching over that index is cheap, deterministic, debuggable and adds no runtime dependency,
no background embedding job, and no index that can silently go stale against the working tree.
Embeddings would add all of that in exchange for fuzzy recall that this workload rarely needs.

If that assumption breaks, the extension point is `ContextSource` in `src/context/manager.ts`: a
semantic retriever is just another source with a `key` and a `load()`. It would be allocated as L3 and
be subject to the same eviction rules as any other knowledge block. No core change is required.

## Project Intelligence

`src/project/knowledge.ts` builds a `ProjectKnowledge` record: stack, primary language and language
breakdown, package manager, source roots, entry points, test paths, config files, important files,
commands, runtime and development dependencies, and conventions.

It is built on the **existing** incremental workspace scan (`src/workspace/index/scan.ts`). It does not
introduce a second filesystem traversal, a second cache or a second index. Structure is derived from
file metadata that the scan already produced; only a handful of small manifests (`package.json`,
`tsconfig.json`, `.editorconfig`, `requirements.txt`) are read, each through the workspace `guard`.

Freshness has two levels:

- A short TTL (30s) answers repeated calls inside a single task without touching the disk.
- After the TTL, the tree is rescanned and a signature is computed from paths, sizes and mtimes. If the
  signature is unchanged the previous record is reused, so a rescan costs metadata only, never parsing.

Degradation is mandatory: if the workspace cannot be scanned the module returns a `partial` record with
an explanatory convention line rather than throwing. Project knowledge is an optimisation, and an
optimisation may never be able to fail a run.

The record is injected through `ContextSource`, a port that already existed in `ContextManager` but had
no implementations. Composition now registers exactly one source, `ProjectKnowledge (L3)`.

## Tool Routing

`src/tools/router.ts` is guidance and classification, not a state machine. It never blocks a call, never
rewrites arguments, and never overrides the permission engine.

Every tool is classified (`discovery`, `read`, `retrieval`, `mutate`, `verify`, `shell`, `ledger`,
`plan`, `vcs`). `routingGuidance(intent, mode, available)` renders an L0 block that states which class
fits which question, ordered so that `bash` is last and described as process work rather than as a file
API. The guidance reflects the tools actually exposed for the current contract mode: in a read-only
ANALYSIS run it does not advertise tools the model cannot call.

`shellRedirect(command)` recognises shell commands that have an exact guarded equivalent, so `cat` can be
answered with `read` (which returns the hash that `write` and `edit` require), `ls` with `list`, `grep`
and `rg` with `search`, `find` with `glob`, and test or typecheck runners with `verify`.

It is deliberately conservative. It refuses to advise whenever the command contains redirection, command
substitution or process substitution, and in a pipeline **every** stage must have an equivalent before
anything is suggested. Anything unrecognised, and anything destructive, is left alone. A wrong redirect
is worse than no redirect.

## Observability

`ContextReport` (`src/domain/types.ts`, built in `src/context/report.ts`) is emitted as a
`context_report` event on every assembled turn and stored on the session. It carries the window, the
usable limit, reserved output, tokens used, free tokens, utilisation, compaction stage, detail scale,
per-category tokens with layer and share, the included and excluded keys, history counts, and before and
after token counts for compaction.

`renderReport()` produces the text form:

```
Context 12.4k / 32.0k (52%) · stage normal · detail 1
  conversation                5.2k  42%
  instructions                2.1k  17%
  memory                      2.0k  16%
  excluded: ProjectKnowledge (L3), archive
  compressed history: 37 events → 4 summaries
  compaction saved: 20.0k → 12.4k
```

The report is pure data: it contains category names and token counts, never file contents, command text
or secrets. The future Context panel can render it directly, and the core does not depend on any UI.

## Security

Nothing in this work relaxes an existing protection.

- **Completion is untouched.** No new component can authorize `COMPLETED`. CompletionPolicy remains the
  only authority, and it reads evidence from storage, never from a summary. Compaction can therefore
  lose model recall but can never manufacture, refresh or forge a proof. The planner emits guidance that
  explicitly states completion is authorized by the completion policy, not by the plan.
- **Untrusted data framing is preserved and extended.** The system prompt continues to declare that file
  contents, memory excerpts and tool outputs are data, not instructions. Project knowledge and task
  memory are rendered as serialized JSON under labelled keys, so injected text in a `package.json` field
  arrives as a quoted value rather than as free prose.
- **Every file read goes through `guard`.** Project intelligence reads manifests through the same
  workspace guard as any tool, and inherits its path traversal, junction and secret-path protections.
- **The router cannot grant capability.** It suggests; the permission engine and trust profiles decide.
  `NEVER_AUTOMATIC` capabilities are unaffected.
- **Pinned context cannot be silently dropped.** Security framing and the contract are pinned L0. If they
  do not fit, allocation reports overflow and the existing `CONTEXT_CAPACITY` error is raised with the
  history preserved, rather than quietly shipping a prompt without its rules.

## Performance

8k, 16k and 32k are first-class targets, not degraded modes.

The fixed cost of a turn is L0: instructions, environment, routing guidance, planning guidance, contract
and tool schemas. Everything else is elastic. At 8k the reserved output allowance and L0 dominate, the
working floor guarantees the live exchange still gets 35% of the limit, and L3 knowledge is the first
thing to go. At 32k all layers are typically admitted at full detail.

Cost control measures: token counting stays heuristic (no tokenizer load); project knowledge is cached by
TTL and by signature so repeated tasks in one workspace do the metadata work at most once per 30s;
knowledge summaries are scaled rather than regenerated; the scan is the existing incremental one; the
report is arithmetic over numbers already computed during assembly.

Compaction now measures utilisation *after* epoch compaction, which removes a real waste: previously a
session that had just been compacted could still be rendered at a reduced detail scale despite having
plenty of room.

## Testing

Two suites are added under `test/`, and are picked up automatically by the existing gate step
(`bun test ./test`); no gate change was required.

`test/context-engine.test.ts`

- Compaction thresholds and stage mapping, including the non-finite guard, and that `normal` renders at
  full detail.
- That a prompt exactly filling the budget produces both the `emergency` compaction stage and the
  budget's own `compress` mode, so the two scales cannot silently disagree, and that every stage is
  reachable at 8k, 16k and 32k.
- Allocation: pinned context always survives, `L4_ARCHIVE` is never included, oversized pinned context
  reports `overflow` instead of disappearing, allocation is deterministic, and L3 collapses under an
  `emergency` stage.
- Shell redirection: correct mappings, and refusal on redirection, pipelines with unknown stages,
  destructive commands and unrecognised binaries.
- Routing guidance reflects the tools actually exposed.
- Planning is not required for a trivial question, is required for a large audit, and its guidance never
  claims authority over completion.
- Report arithmetic, ordering, and rendering.
- One integration test asserting a real run emits `context_report` with the pinned categories present and
  the archive excluded, and that the assembled system prompt contains the L0 routing and planning blocks.

`test/project-intelligence.test.ts`

- Derivation of stack, source roots, entry points, test paths, config and important files, dependencies,
  conventions and commands from a real fixture workspace.
- Signature reuse when the tree is unchanged, and rebuild when a file is added.
- Summary scaling, and graceful degradation on an unreadable workspace.

## Future Evolution

Deliberately not built yet, in rough priority order:

1. **Model-authored task memory.** `taskMemory()` is derived from storage. A model-written narrative could
   be added as an additional L2 block, but only as an aid; it must never become the source of evidence.
2. **Retrieval feedback.** Record which retrieved files were actually used and bias later selection.
3. **Semantic retrieval port.** Only if lexical retrieval demonstrably fails on large workspaces.
4. **Per-tool output budgets.** Output limits exist per call; a turn-level budget would let a large read
   yield space to a large test log automatically.
5. **Context panel.** `ContextReport` is already shaped for it; the UI is a rendering task, not a core one.
6. **Cross-session project knowledge.** Persist `ProjectKnowledge` in storage so a new session on a known
   workspace starts informed. The in-memory cache is per process today.
