# Nexus v0.2.3 — Agent Intelligence Layer

**Scope:** agent orchestration only. No UI redesign, no new providers or models, no storage rewrite, and
**no change to `CompletionPolicy`** — it remains the sole authority that may authorise `COMPLETED`.

**Status of the quality gate:** `bun run check` was **NOT executed** by the author of this change set.
The environment used to produce it has no Bun runtime and no network access. What *was* executed is a
Node-based harness over the four new pure modules: **17/17 assertions pass** (output in
`local-evidence/harness-output.txt`). Everything that touches the loop, the executor, the permission
engine and Bun's test runner is **unverified** and must be run by you. See
[§8 Verification status](#8-verification-status).

---

## 1. The problem

After Phase 0 the architecture is sound but the orchestration has one shape. Every request becomes a
coding contract whose criteria can only be discharged by running the project's trusted checks:

```
VERIFY -> REPRODUCE -> FIX -> TEST -> COMPLETE
```

For "покажи структуру проекта" this is not merely wasteful, it is wrong. The agent is pushed to build
and test a tree it was never asked to touch, and `CompletionPolicy` is *correct* to refuse completion
until it does. The defect is not in the policy. It is that nothing upstream of the loop ever decided
**what kind of task this is**.

Four further symptoms share that root cause: no read-only execution mode, no memory of repeated
failures (so `bash FAILED` repeats until the execution budget dies), no component asking "are we
stuck?", and a permission model with no way to say "`bun test` is fine in this workspace".

---

## 2. Architecture

```
                        ┌──────────────────────────────────────┐
  goal ───────────────▶ │  resolveIntent()   (pre-loop, once)  │
                        │  intelligence/intent.ts              │
                        └──────────────────┬───────────────────┘
                                           │ TaskIntent { type, execution,
                                           │   mutationAllowed, verificationRequired,
                                           │   allowedTools, workflow }
                                           ▼
                        ┌──────────────────────────────────────┐
                        │            SUPERVISOR                │  strategy, not execution
                        │      intelligence/supervisor.ts      │  "are we stuck? repeating?"
                        └───┬──────────────┬───────────────┬───┘
                            │              │               │
                    Planner │      Executor│               │ Reviewer
              planner/plan  │  core/agent-loop             │ verification/engine
              + update_plan │  + tools/executor            │ + completion/policy
                            │              │               │
                            │              ▼               │
                            │   toolAllowed() gate         │  ← READ_ONLY enforcement
                            │   permissions/engine         │
                            │   + intelligence/trust.ts    │  ← TrustProfile
                            │              │               │
                            └──────────────┴───────────────┘
                                           │
                                  intelligence/memory.ts
                                  (derived from the durable actions ledger)
```

The Supervisor names a structure that already existed but had no head: `planner/plan` + the
`update_plan` tool are the **Planner**, the loop + `ToolExecutor` are the **Executor**, and
`VerificationEngine` + `CompletionPolicy` are the **Reviewer**. Each of those judges only the step in
front of it. The Supervisor is the one component that judges the *trajectory*.

### New files

| File | Lines | Responsibility |
|---|---|---|
| `src/intelligence/intent.ts` | 242 | Task classification, read-only tool surface, `toolAllowed` gate |
| `src/intelligence/memory.ts` | 78 | `ToolFailureMemory` derived from the actions ledger |
| `src/intelligence/supervisor.ts` | 70 | Strategy decisions above the loop |
| `src/intelligence/trust.ts` | 98 | `TrustProfile` data model, matching, safety floor |
| `test/agent-intelligence.test.ts` | — | The three mandated scenarios + unit coverage |

All four modules are **pure**: no I/O, no storage, no clock. They import only `domain/types` (types),
`completion/intent` (the existing classifier) and `loop-guard/policy` (`canonical`). No cycles, so
`script/boundaries.ts` stays green.

---

## 3. Component 1 — Task Intent Classification

```ts
TaskIntent {
  type: "ANALYSIS" | "DEBUG" | "FEATURE" | "REFACTOR" | "AUDIT"
  execution: "READ_ONLY" | "MUTATING"
  mutationAllowed: boolean
  verificationRequired: boolean
  allowedTools: string[]
  workflow: string[]        // UNDERSTAND->READ->OUTPUT, REPRODUCE->PLAN->EDIT->VERIFY, ...
  confidence: "high" | "low"
  reason: string            // why, in one line, for the event log
}
```

`resolveIntent(goal, requestedMode?)` runs **once, before the loop**, in `createNexus().create()`.
The classification order is deliberate:

| # | Condition | Result |
|---|---|---|
| 1 | empty goal | `FEATURE` / low confidence |
| 2 | **explicit refusal to mutate** ("не меняй ничего", "do not change") | `ANALYSIS` / high |
| 3 | `classifyIntent(goal) === "repair"` (existing v0.2.2 classifier) | `DEBUG` / high |
| 4 | refactor vocabulary | `REFACTOR` |
| 5 | construction vocabulary | `FEATURE` / high |
| 6 | audit vocabulary | `AUDIT` |
| 7 | explanatory vocabulary or a whole-word interrogative | `ANALYSIS` / high |
| 8 | otherwise | `FEATURE` / low — **the unchanged v0.2.2 behaviour** |

**Design decisions**

- **The default is unchanged.** Only decisive vocabulary demotes a task to read-only. Anything
  ambiguous keeps the mutating, verification-required path, because wrongly dropping a proof is much
  worse than wrongly demanding one.
- **A direct instruction outranks vocabulary.** "Объясни архитектуру и добавь модуль" is `FEATURE`
  (it demands a change); "Покажи структуру. Не меняй ничего." is `ANALYSIS`. Rule 2 sits above rule 3
  so that even repair vocabulary cannot re-enable mutation against an explicit refusal.
- **The negation window.** A negation counts only within the next three tokens before a mutation
  stem, and negations match as whole words. Prefix matching would make "неверный" a negation;
  a global search would make "измени так, чтобы **не** ломать API" read-only.
- **Interrogatives match as whole words.** This was found by the harness, not by review: the stem
  `"что"` prefix-matches `"чтобы"`, which turned every "сделай так, **чтобы** …" instruction into a
  question and would have routed real work into read-only mode. `questionWords` is now an exact-match
  set. (`src/completion/intent.ts` has the same latent issue; it is out of scope here and untouched.)
- **`resolveIntent` yields to an explicit contract mode.** If the caller asks for `mode: "coding"`,
  the read-only tool restriction is dropped. A coding contract whose tools cannot produce evidence is
  an unprovable contract, and an unprovable contract is exactly what this release is trying to remove.

---

## 4. Component 2 — READ_ONLY mode

```ts
export const READ_ONLY_TOOLS = ["list", "glob", "search", "read", "retrieve", "history", "output"]
```

Allowed: `list` `glob` `search` `read` `retrieve` `history` `output`.
Refused: `write` `edit` `bash` `verify` `git_status` `git_diff` `update_plan` — everything else.

Enforcement is in **two** places, and that redundancy is intentional:

1. **`core/agent-loop.ts`** filters the tool specs offered to the model, so a read-only task never
   sees `bash` in its tool list. This is *ergonomics*: models comply far better with an absent tool
   than with a scolding.
2. **`tools/executor.ts`** re-checks at the top of `try`, before `inputSchema.parse` and before
   `permissions.authorize`. This is *enforcement*: a model that hallucinates a tool name, a replayed
   call, or a future code path cannot bypass the gate. Nothing is parsed and nothing is authorised
   before the gate runs.

The refusal is thrown as `NexusError("BOUNDARY", …)`, which the executor already treats as
"failed before mutation": the action is recorded `FAILED`, is **not** re-thrown, and comes back to the
model as an ordinary tool result explaining which tools it may use. The run continues and answers.

**Why `update_plan` is excluded.** A read-only task runs on the existing `answer` contract. Pending
plan steps make `completionPolicy` return `INCOMPLETE` forever, so a plan tool in answer mode is a
guaranteed hang.

**Why the `answer` contract instead of a new mode.** Nexus already has a contract whose single
criterion is a `GOAL_ASSERTION` and whose `checks` are empty — that *is* "the answer is the
deliverable". Reusing it means `CompletionPolicy` is untouched, no task gets a private route to
`COMPLETED`, and "evidence before completion" still holds: for an analysis task the evidence is the
answer, asserted against an unchanged workspace fingerprint.

---

## 5. Component 3 — Error Memory

```ts
ToolFailureMemory {
  tool: "bash"
  command: "bun test"        // the shell command, or canonical arguments
  signature: string          // tool + canonical(arguments)
  failures: 3
  lastError: string
  firstFailedAt / lastFailedAt: number
  actionIds: string[]
  recommendation: "retry" | "change strategy" | "request user input"
}
```

Thresholds: **3 failures → change strategy**, **5 failures → request user input**.

`LoopGuard` already looks for repetition, but it reads a sliding window of the last eight actions and
counts *signatures*, not *failures*. An agent that fails, reads a file, fails, reads another file and
fails again never fills that window — and that is precisely the observed `bash FAILED ×4` pattern.
Error memory asks a different question: **per signature, how many failures since its last success?**

**Design decisions**

- **Derived, not stored.** It is computed from the durable `actions` projection. No new table, no
  migration (storage is explicitly out of scope), it survives restarts for free, and it cannot drift
  from the ledger it summarises.
- **A success clears the signature.** An action that works once is not evidence of a stuck agent,
  however often it failed before.
- **Signatures are exact.** `bash "bun test"` and `bash "bun test --watch"` are different problems and
  are counted apart.

---

## 6. Component 4 — Supervisor

```ts
supervise({ session, actions, evidence, guard }) -> SupervisorDecision | undefined
```

Precedence, highest first:

| # | Condition | Decision | Source |
|---|---|---|---|
| 1 | `guard.action === "STOP"` | `STOP` | loop-guard |
| 2 | worst signature `>= 5` failures | `REQUEST_USER_INPUT` → run ends `FAILED` with an explanation | error-memory |
| 3 | worst signature `>= 3` failures | `CHANGE_STRATEGY` naming the command and its error | error-memory |
| 4 | any other guard decision | passthrough, **verbatim** | loop-guard |
| 5 | otherwise | `undefined` | — |

**Two hard rules.**

1. **It never authorises completion.** It can stop a run and it can redirect one. It cannot finish
   one. `CompletionPolicy` remains the only component that may reach `COMPLETED`.
2. **It never weakens `LoopGuard`.** Every guard decision is still honoured, and guard-sourced
   guidance keeps the exact v0.2.2 string
   `` `${action}: ${reason}. Choose a different action; do not repeat the loop.` `` — a guard-driven
   turn is byte-identical to before.

**Why rule 3 outranks a generic guard `DIAGNOSE`.** With three identical failures both fire. The guard
says "Same tool and arguments without new information"; error memory says "`bash "exit 1"` has failed
3 times, last error …, do not run it again — take a different approach or ask the user". The second is
actionable, and the mandated behaviour for scenario 3 is *смена стратегии*, not a generic nudge.
Risk was checked against `test/reliability.test.ts`: it calls `loopGuard` directly (untouched), and its
"repeated reads" case uses *succeeding* reads, so error memory stays empty and the guard passes through
unchanged.

---

## 7. Component 5 — Trust Profiles

```ts
TrustProfile {
  workspace: string
  level: "safe" | "normal" | "trusted-workspace" | "autonomous"
  rules: [{ action: "bash", pattern: "bun test", permission: "allow" }]
}
```

Foundation only: no file format, no UI, no persistence — as requested. What it does fix is the shape
of the answer and the safety floor around it.

- **`NEVER_AUTOMATIC = [SECRET_ACCESS, WRITE_OUTSIDE_PROJECT, SYSTEM_MUTATION]`.** No rule and no
  level may grant these; an `allow` degrades to `ask`. `autonomous` is not a synonym for `root`.
- **Composition is monotonic.** `deny` from either the engine defaults or a rule wins. A profile can
  satisfy an `ask` or tighten a decision; it can never weaken a `deny`.
  ```ts
  const decision = baseline === "deny" || trusted?.permission === "deny" ? "deny" : (trusted?.permission ?? baseline)
  ```
- **Patterns are literal**, with one optional trailing `*`. A regex read from a config file is both an
  injection surface and a ReDoS surface.
- **Later rules win**, so an operator can append `{ "bun run deploy", deny }` after `{ "bun *", allow }`
  without rewriting the list.
- **Explicit `options.rules` always beat level defaults**, so every existing test keeps its behaviour.

---

## 8. Changed files

Five existing files need small, anchored edits. **These edits are specified but not applied** — see
§9. Each is a search-and-replace on a unique anchor.

### 8.1 `src/domain/types.ts` — additive only

Add the three types, and one optional field to `AgentSession`:

```ts
export type TaskType = "ANALYSIS" | "DEBUG" | "FEATURE" | "REFACTOR" | "AUDIT"
export type ExecutionMode = "READ_ONLY" | "MUTATING"
export type TaskIntent = {
  type: TaskType
  execution: ExecutionMode
  mutationAllowed: boolean
  verificationRequired: boolean
  allowedTools: string[]
  workflow: string[]
  confidence: "high" | "low"
  reason: string
}
// in AgentSession:
  intent?: TaskIntent
```

The type lives in `src/domain/` because `AgentSession` references it and `src/domain/` may not import
outside itself (`script/boundaries.ts`). It is **optional**: a session written by v0.2.2 loads and runs
unchanged. `SqliteStore` serialises the session header as raw JSON and reads it back with
`JSON.parse(row.data) as AgentSession` with no schema validation, so **no storage change is required**.

### 8.2 `src/composition.ts`

```ts
// add imports
import { contractMode, resolveIntent } from "./intelligence/intent"
import { levelRules, type TrustProfile } from "./intelligence/trust"

// add to the options object of createNexus
  trust?: TrustProfile

// replace:
//   const executor = new ToolExecutor(store, new PermissionEngine(options.rules, options.permission), sandbox)
const rules: Rules = { ...(options.trust ? levelRules(options.trust.level) : {}), ...options.rules }
const executor = new ToolExecutor(store, new PermissionEngine(rules, options.permission, options.trust), sandbox)

// in create(), replace the goalCheck/contract pair:
const intent = resolveIntent(input.goal, input.mode)
const mode = input.mode ?? contractMode(intent)
const goalCheck = input.goalCheck ?? (mode === "answer" ? undefined : await inferGoalCheck(workspace, input.goal))
const contract = createContract(redact(input.goal), project, mode, goalCheck)

// add `intent,` to the AgentSession literal, and to the "created" event payload
```

Note that `inferGoalCheck` is now skipped for analysis tasks — one less filesystem probe on a task
that was never going to run a check.

### 8.3 `src/tools/executor.ts` — the enforcement gate

```ts
import { toolAllowed } from "../intelligence/intent"

// first statements inside `try`, immediately after abort(signal):
      abort(signal)
      if (!toolAllowed(session.intent, tool.name, session.contract.mode))
        throw new NexusError(
          "BOUNDARY",
          `Tool ${tool.name} is unavailable: this task is classified ${session.intent?.type ?? "UNKNOWN"} and runs read-only. Allowed tools: ${(session.intent?.allowedTools ?? []).join(", ")}. Use one of those, or answer with what you already have.`,
        )
```

`BOUNDARY` is already in the executor's "failed before mutation" list, so the action is recorded
`FAILED` (never `UNKNOWN`) and the error is returned to the model rather than re-thrown. No new error
code, so `shared/errors.ts` is untouched.

### 8.4 `src/permissions/engine.ts`

```ts
import { matchPermission, type TrustProfile } from "../intelligence/trust"

// third constructor parameter (optional -- every existing call site is unchanged):
    private readonly trust?: TrustProfile,

// in authorize(), replace `const decision = this.evaluate(request.capabilities)` with:
    const baseline = this.evaluate(request.capabilities)
    const trusted = matchPermission(this.trust, {
      action: request.tool,
      command:
        typeof request.arguments === "object" && request.arguments && "command" in request.arguments
          ? String((request.arguments as { command?: unknown }).command)
          : undefined,
      capabilities: request.capabilities,
    })
    const decision = baseline === "deny" || trusted?.permission === "deny" ? "deny" : (trusted?.permission ?? baseline)
```

`evaluate()` itself is unchanged, so `commandCapabilities` and every existing permission test behave
exactly as before.

### 8.5 `src/core/agent-loop.ts` — three edits

```ts
import { toolAllowed } from "../intelligence/intent"
import { supervise } from "../intelligence/supervisor"

// (a) replace:
//   const specs = session.contract.mode === "answer" ? [] : snapshot.specs
const specs = snapshot.specs.filter((spec) => toolAllowed(session.intent, spec.name, session.contract.mode))

// (b) replace:
//   if (calls.length && (session.contract.mode === "answer" || !session.model.capabilities.toolCalling))
if (calls.length && (!specs.length || !session.model.capabilities.toolCalling))

// (c) replace the loopGuard call and wrap the existing handling:
const actions = this.deps.store.list("actions", id)
const evidence = this.deps.store.list("evidence", id)
const guard = loopGuard(session, actions, evidence)
const decision = supervise({ session, actions, evidence, guard })
if (decision) {
  publish(this.deps.store, session, this.deps.emit, "supervisor", {
    action: decision.action,
    reason: decision.reason,
    source: decision.source,
  })
  // REQUEST_USER_INPUT terminates the run the same way the existing STOP branch does:
  // record the reason, transition to FAILED, return. Keep the existing STOP code as-is.
  // Otherwise inject the guidance and continue the loop:
  session.conversation.push({ role: "system", content: decision.guidance })
}
```

Edit (a) is behaviour-preserving for every pre-v0.2.3 session: with no intent, `toolAllowed` returns
`mode !== "answer"`, which is exactly the expression it replaces. Edit (b) makes the "no tools
 available" branch follow from the filtered list rather than from the mode.

---

## 9. Verification status

### What was executed

A Node 24 harness (`local-evidence/harness.ts`, run with `tsx --test`) exercising the four new modules
against a shim of `domain/types` plus **verbatim copies** of `completion/intent.ts` and the `canonical`
helper from `loop-guard/policy.ts`:

```
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

Coverage: the classification table and all three mandated goals; the read-only tool matrix; the
legacy `intent === undefined` path; failure counting, success-reset and both thresholds; supervisor
precedence including byte-identical guard guidance; trust matching, wildcards, later-rule-wins, the
`NEVER_AUTOMATIC` floor and profile parsing. Formatting was checked with the repo's Prettier config
(`{ "semi": false, "printWidth": 120 }`) and the modules are clean.

The harness also caught one real defect that review had missed — the `"что"`/`"чтобы"` prefix collision
described in §3.

### What was NOT executed

- **`bun run check` (typecheck · boundaries · test · bench · build · smoke · product).** No Bun and no
  network in the authoring environment. The v0.2.2 baseline is 7/7 PASS, 142 pass / 3 skip / 0 fail.
- **`test/agent-intelligence.test.ts`.** It uses `bun:test` and the real `fixtureWith` harness.
- **The five wiring edits in §8.** They are specified against verified anchors, but they were never
  compiled or run.

### Reproduce

```bash
cd NexusCLI/nexus
bun install
bun run check
bun test ./test/agent-intelligence.test.ts
bunx prettier --check src test
```

Expected after the change: 145 pass / 3 skip / 0 fail, 7/7 gate steps green. Any deviation is a bug in
this change set, not in the baseline.

---

## 10. Compliance with the constraints

| Constraint | How it is met |
|---|---|
| Do not rewrite the core | Four new pure modules; the loop changes by three anchored edits |
| Do not break `CompletionPolicy` | Not modified. Read-only tasks reuse the existing `answer` contract |
| Keep "evidence before completion" | Unchanged for mutating tasks. For analysis the answer *is* the deliverable, asserted against an unchanged fingerprint |
| Preserve existing tests | Every v0.2.2 goal used by the suite still classifies mutating/`coding` — asserted in the harness. Default rules, `evaluate()` and `loopGuard` are untouched |
| Agent Intelligence Layer only | No UI, provider, model or storage change; storage needs no migration |

## 11. Known limitations

1. **Classification is lexical.** No model call, no confidence calibration — deliberate: it must be
   deterministic, instant and testable. It will mis-handle unusual phrasings; the failure direction is
   biased toward the safe (verified) default, and `mode` is the escape hatch.
2. **The intent is fixed at session creation.** A task that turns out to need mutation halfway through
   cannot re-classify itself; the user starts a new session or passes `mode: "coding"`.
3. **Trust profiles have no persistence or UI.** Foundation only, per the brief.
4. **The Supervisor is reactive.** It reads the ledger; it does not plan. Turning `workflow` into an
   enforced state machine is the natural next step and was deliberately left out of v0.2.3.
