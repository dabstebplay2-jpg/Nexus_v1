# nexus-context-foundation: Context Engine, Project Intelligence, Tool Routing, Observability

## Architectural summary

Context becomes a variable with a declared priority model instead of a transcript with a fallback ladder.

Five layers are declared explicitly (`src/context/layers.ts`): **L0 critical**, **L1 active working
context**, **L2 task memory**, **L3 project memory**, **L4 archive**. L0 is pinned and admitted first.
L4 is never sent to the model at all and is reachable only through the `history` and `output` tools.
Everything between is allocated a share of what is left, and that share depends on the compaction stage.

Three invariants hold the design together:

1. **One assembler.** `ContextManager.build()` remains the only place a provider request is built. No
   second prompt path was added.
2. **Evidence is never prose.** Verification evidence, source hashes and completion state stay in
   storage and are read by CompletionPolicy directly. A summary aids the model; it is never a proof.
   Compaction can therefore cost the model recall, but it cannot affect completion correctness.
3. **Degradation is ordered, bounded and observed.** The cheapest layer is dropped first, whole blocks
   are excluded rather than truncated, pinned context can never be silently dropped, and every decision
   is reported in a `context_report` event.

Around that sit three smaller foundations the context engine needs in order to be useful: project
knowledge as an L3 source, tool routing guidance as an L0 block, and an intent-driven planning
requirement as an L0 block.

## What already existed in Nexus

I checked the claims in the brief against the code first. Most of the context machinery was already
there, and none of it was rewritten or duplicated:

| Already present | Where |
| --- | --- |
| `ContextManager`, epochs, `compact()`, `recoverOverflow()`, `context_budget` / `context_compressed`, `AGENTS.md` loading with a 12000-byte cap, `CONTEXT_CAPACITY` | `src/context/manager.ts` |
| `contextBudget` / `contextMode`, output reservation, tokenizer pressure | `src/context/budget.ts` |
| `HeuristicTokenCounter` (3.5 chars/token Latin, wide /2, CJK 1), `countMessages`, `countTools` | `src/context/tokens.ts` |
| `taskMemory()` structured bounded summary, `messageGroups()` atomic tool groups | `src/context/memory.ts` |
| Durable, numbered, replayable epochs | `context_epochs` table |
| Lexical retrieval and the `retrieve` tool | `src/project/retrieval.ts` |
| `detect()` project detection at session create | `src/project/detect.ts` |
| Error memory: `failureMemory`, `worstFailure`, `failureBriefing`, `REPEAT_LIMIT` 3, `TERMINAL_LIMIT` 5 | `src/intelligence/memory.ts` |
| Intent classification, `READ_ONLY_TOOLS`, `contractMode`, `toolAllowed`, supervisor over LoopGuard, trust profiles, `NEVER_AUTOMATIC` | `src/intelligence/` |
| Full per-tool contract in `defineTool` (capabilities, risk, timeout, output limit, permissions) | `src/tools/registry.ts` |
| Incremental workspace index, `FileHashCache`, Merkle tree, secret and symlink exclusions | `src/workspace/index/` |
| CompletionPolicy as the sole COMPLETED authority, also enforced in `core/state.ts` | `src/completion/policy.ts` |

Consequences for this change set: no new storage, no new index, no second filesystem traversal, no
second task system, no vector database, no Agent Loop rewrite, and no new tool system.

## What this change set adds

**New**

- `src/context/layers.ts` - the layer model. `LAYER_ORDER`, `compactionThresholds`
  (soft 0.70 / hard 0.85 / emergency 0.95), `compactionStage()`, `detailScales`, `stageEntry()`,
  `layerShares()`, and `allocate()`. Pinned blocks are admitted first in input order; each layer then
  gets `floor(discretionary * share)`; a block that does not fit its share is excluded whole; unmet
  pinned demand is returned as `overflow` rather than hidden.
- `src/context/report.ts` - `buildReport()`, `formatTokens()`, `renderReport()`. Per-category tokens
  with layer and share, included and excluded keys, history counts, before/after compaction.
- `src/tools/router.ts` - tool classification (`discovery`, `read`, `retrieval`, `mutate`, `verify`,
  `shell`, `ledger`, `plan`, `vcs`), `routingGuidance()` rendered as L0, and `shellRedirect()` mapping
  shell commands to guarded equivalents.
- `src/planner/policy.ts` - `taskComplexity()` and `planningRequirement()`, with per-intent workflows
  (ANALYSIS, AUDIT, DEBUG, FEATURE, REFACTOR) rendered as L0 planning guidance.
- `src/project/knowledge.ts` - `ProjectKnowledge` and `knowledgeSummary()`, built on the existing
  `scan()`, cached by TTL and by a path/size/mtime signature.
- `test/context-engine.test.ts`, `test/project-intelligence.test.ts`.
- `NEXUS_CONTEXT_ARCHITECTURE.md`.

**Modified**

- `src/context/manager.ts` - assembles pinned and optional blocks, allocates them, derives the stage,
  and emits `context_report`. Existing behaviour of `compact()`, `recoverOverflow()`, `event()` and the
  `CONTEXT_CAPACITY` error is unchanged.
- `src/context/budget.ts` - `contextUtilisation()` extracted out of `contextMode()`, plus a new
  `budgetUtilisation()` used for compaction staging. `contextMode()` behaviour is unchanged.
- `src/context/memory.ts` - `TaskMemoryRecord` typed, and recorded failures now reach the prompt.
- `src/domain/types.ts` - `ContextLayer`, `CompactionStage`, `ContextCategory`, `ContextReport`;
  `AgentSession.context` gains `stage` and `report`.
- `src/composition.ts` - registers exactly one `ContextSource`: `ProjectKnowledge (L3)`.
- `docs/ARCHITECTURE.md` - one appended `## Context Engine` section.

## One bug this work found in itself

The compaction thresholds were originally measured against the context window, reusing
`contextUtilisation()`. A local runtime check of the arithmetic showed that was wrong:

```
contextBudget defines limit = (window * 0.9 - output) / pressure
=> a prompt that completely fills the budget reaches only 0.90 window utilisation
=> a 0.95 emergency threshold on that scale can never fire
```

An unreachable emergency stage is worse than no emergency stage, so staging now uses
`budgetUtilisation()` (fraction of the *admissible* input budget, exactly 1.0 when full).
`contextMode()` keeps its original window-scale thresholds and its original behaviour, and now sits
above the compaction stages as the last-resort provider guard. Measured:

| window | output | limit | target | stage at target | stage at limit | mode at limit |
| --- | --- | --- | --- | --- | --- | --- |
| 8192 | 1024 | 6348 | 4710 | soft | emergency | prepare |
| 16384 | 1024 | 13721 | 10444 | soft | emergency | prepare |
| 32768 | 1024 | 28467 | 21913 | soft | emergency | prepare |

`test/context-engine.test.ts` now guards that every stage is reachable at all three window sizes.

## Decisions deliberately NOT implemented

- **No vector database and no embedding pipeline.** A single-user, single-workspace agent has a small
  candidate set, exact identifiers to match, and an already-hashed index. Lexical retrieval is cheap,
  deterministic and cannot go stale against the working tree. `ContextSource` is the extension point if
  that assumption ever breaks.
- **No model-authored task memory.** `taskMemory()` stays derived from storage. A model narrative could
  be added later as an extra L2 block, but never as a source of evidence.
- **No enforcement in the tool router.** It classifies and advises. Blocking stays with the permission
  engine and trust profiles, and `shellRedirect()` stays silent on anything with redirection, command
  substitution, an unrecognised stage in a pipeline, or a destructive effect. A wrong redirect is worse
  than no redirect.
- **No cross-session project knowledge.** The cache is per process. Persisting it is a storage change,
  and it was not needed to make the layer work.
- **No changes to CompletionPolicy, VerificationEngine, Agent Loop, storage schema, the tool registry
  contract, or any security protection.**
- **No UI work.** `ContextReport` is shaped for a Context panel, but no frontend was touched, and no
  Agent Core state was moved into React.
- **No `script/check.ts` change.** New tests are discovered by the existing `bun test ./test` step.

## Tests

`test/context-engine.test.ts` - 8 tests: threshold and stage mapping including the non-finite guard;
every stage reachable at 8k/16k/32k with the provider guard above them; allocation invariants (pinned
never dropped, L4 never included, `overflow` reported, deterministic, L3 collapses at `emergency`);
shell redirect mappings and refusals; routing guidance reflecting only exposed tools; planning not
required for a trivial question, required for a large audit, and never claiming authority over
completion; report arithmetic and rendering; and one integration test that runs a real fixture session
and asserts a `context_report` event with the pinned categories present, the archive excluded, and the
L0 routing and planning blocks in the assembled system prompt.

`test/project-intelligence.test.ts` - 3 tests: derivation from a real fixture workspace; signature
reuse when unchanged and rebuild when a file is added; summary scaling and graceful degradation on an
unreadable workspace.

## Quality gate

**`bun run check` was not run. I am not claiming it passes.** Bun is not installed in the environment I
worked in, that environment has no network access, and the code base uses Bun-only APIs (`Bun.file`,
`Bun.CryptoHasher`, `bun:sqlite`, `bun:test`), so the gate could not execute. Please run it locally.

What I did run, and what it showed:

| Check | Command | Result |
| --- | --- | --- |
| Types, pure subset | `npx tsc --noEmit` against `layers`, `report`, `budget`, `manager`, `router`, `policy`, `knowledge`, `memory`, `types` with a minimal `Bun` declaration shim | clean, no diagnostics |
| Runtime logic | `npx tsx` over ~70 assertions on `compactionStage`, `budgetUtilisation`, `contextMode`, `allocate`, `shellRedirect`, `redirectAdvice`, `toolClass`, `routingGuidance`, `preferredTools`, `taskComplexity`, `planningRequirement`, `buildReport`, `formatTokens`, `renderReport` | all passed |
| Doc fidelity | `git hash-object` on the reproduced `docs/ARCHITECTURE.md` vs the blob on `main` | identical (`5fb411b0...`) |
| Formatting | `npx prettier --check docs/ARCHITECTURE.md` | clean |

Not executed here: `boundaries`, `bench`, `build`, `smoke`, `product`, and the two new test files under
`bun test`. The integration tests in particular have never been run and are the most likely place to
need a fix.

Boundary rules were respected by construction: no `import * as`, no aliased imports, no import from
`src/domain/**` outward, and no new cycle (`context` imports `tools/router` and `planner/policy`;
neither imports `context`).

## Benchmark / performance results

No benchmark was run - `bench/run.ts` needs Bun. The numbers above are computed budget arithmetic, not
timings. Design-level cost notes:

- Token counting stays heuristic; no tokenizer is loaded.
- Project knowledge is cached by a 30s TTL and then by a path/size/mtime signature, so a repeat task in
  one workspace does metadata work at most once per TTL and parses manifests only when the tree really
  changed. Only `package.json`, `tsconfig.json`, `.editorconfig` and `requirements.txt` are read.
- The scan is the existing incremental one, with a 50000-file ceiling for knowledge derivation.
- The report is arithmetic over numbers already computed during assembly.
- Compaction staging is measured *after* epoch compaction, which fixes a real waste: a session that had
  just been compacted could previously still be rendered at a reduced detail scale.

## Migration implications

None required. No schema change, no migration, no config change.

- `AgentSession.context.stage` and `.report` are optional; sessions written before this change load and
  run unchanged, and the first assembled turn fills them in.
- `context_report` is a new event type. Consumers that switch on event type should ignore unknown types;
  the server timeline forwards events generically.
- Prompt category labels changed to the L0-L4 naming (`ProjectContext (L3)`, `TaskMemory (L2)`,
  `InstructionsContext (L0)`). I checked `test/agent-loop.test.ts` first: it makes no assertions on
  these labels.
- The layer numbering in the brief conflicts with the old internal comments in `manager.ts`, where L0
  meant the current exchange and L2 meant project context. I renumbered to the brief's model, since
  having two contradictory layer vocabularies in one file is worse than a rename.

## Risks

1. **The gate has not run.** Highest risk in this change set. Most likely failure points are the two
   integration tests and `boundaries`.
2. **Project knowledge could displace working context.** Mitigated by a `workingFloor` of 0.35 of the
   limit withheld from allocation, and by L3 being the first layer squeezed. A prompt that fits only
   because knowledge evicted the current tool result is a blind prompt, not a small one.
3. **`shellRedirect()` false positives.** Mitigated by refusing on redirection, substitution, unknown
   pipeline stages and destructive commands, and by advising only - it never rewrites a call.
4. **Untrusted content in manifests.** `package.json` fields reach the prompt. They are serialized as
   JSON values under labelled keys, and the existing framing that file content is data, not
   instructions, is preserved. Reads go through the workspace `guard`.
5. **Heuristic token counting.** Unchanged from before, but the stages now depend on it. The existing
   pressure multiplier and `recoverOverflow()` remain the safety net.

## Follow-up work

1. Run `bun run check` and fix whatever the integration tests surface.
2. Persist `ProjectKnowledge` in storage for cross-session warm start.
3. Feed retrieval outcomes back into selection (which retrieved files were actually used).
4. Turn-level tool output budgets, so a large read can yield space to a large test log.
5. Build the Context panel on `ContextReport`, and split Chat from the execution trace using the event
   stream that already exists.
6. A semantic retrieval `ContextSource`, only if lexical retrieval demonstrably fails at scale.
