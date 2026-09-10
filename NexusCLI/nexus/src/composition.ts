import path from "node:path"
import { mkdir, realpath } from "node:fs/promises"
import { z } from "zod"
import type { NexusAPI } from "./api"
import type { AgentSession } from "./domain/types"
import type { EventSink, PermissionReply, Provider, Store } from "./domain/ports"
import type { SandboxProvider } from "./sandbox/ports"
import { SqliteStore } from "./storage/sqlite"
import { OpenAICompatibleProvider } from "./llm/openai-compatible"
import { ContextManager } from "./context/manager"
import { AgentLoop } from "./core/agent-loop"
import { publish } from "./core/state"
import { admit } from "./session/inbox"
import { defaultBudgets } from "./config/config"
import { createContract } from "./completion/policy"
import { inferGoalCheck } from "./completion/infer"
import { detect } from "./project/detect"
import { gitBaseline } from "./git/baseline"
import { agentChanges } from "./git/changes"
import { rollback } from "./git/rollback"
import { PermissionEngine, type Rules } from "./permissions/engine"
import { LocalSandboxProvider } from "./sandbox/local"
import { ToolRegistry, defineTool } from "./tools/registry"
import { builtinTools } from "./tools/builtin"
import { ToolExecutor } from "./tools/executor"
import { VerificationEngine } from "./verification/engine"
import { inventory, inventoryFingerprint } from "./verification/delta"
import { establishTrust } from "./verification/integrity"
import { planSchema, revisePlan } from "./planner/plan"
import { NexusError } from "./shared/errors"
import { redact } from "./shared/redact"

/** The single composition root. Production uses SQLite and HTTP; tests inject only the provider. */
export async function createNexus(options: {
  dataDir: string
  provider?: Provider
  store?: Store
  rules?: Rules
  sandbox?: SandboxProvider
  permission?: PermissionReply
  onEvent?: EventSink
}): Promise<NexusAPI> {
  await mkdir(options.dataDir, { recursive: true })
  const store = options.store ?? new SqliteStore(path.join(options.dataDir, "nexus.db"))
  const emit: EventSink = options.onEvent ?? (() => {})
  // The only execution backend Phase 0 ships. It reports honestly that it isolates nothing;
  // a container or job-object provider can replace it here alone.
  const sandbox = options.sandbox ?? new LocalSandboxProvider()
  const executor = new ToolExecutor(store, new PermissionEngine(options.rules, options.permission), sandbox)
  const verification = new VerificationEngine(store, executor)
  const registry = new ToolRegistry()
  builtinTools().forEach((tool) => registry.register(tool))
  registry.register(
    defineTool({
      name: "update_plan",
      description:
        "Replace the active plan. DONE steps require existing passing evidence IDs and completed dependencies. Does not alter the completion contract.",
      input: z.object({ steps: planSchema }),
      execute: async (input, ctx) => {
        ctx.session.plan = revisePlan(input.steps, ctx.session.plan, store.list("evidence", ctx.session.id))
        store.save(ctx.session)
        return { output: JSON.stringify(ctx.session.plan) }
      },
    }),
  )
  registry.register(
    defineTool({
      name: "verify",
      description:
        "Run trusted project checks and the user-selected goal scenario. Read verification evidence; fix failures before proposing completion.",
      input: z.object({}),
      execute: async (_, ctx) => {
        const run = await verification.run(ctx.session, ctx.signal, () => {
          ctx.waiting()
          publish(store, ctx.session, emit, "permission", "Verification approval required")
        })
        const evidence = store.list("evidence", ctx.session.id).filter((item) => run.evidenceIds.includes(item.id))
        const failed = store
          .list("actions", ctx.session.id)
          .some((action) => action.turnId === run.id && action.status === "FAILED")
        const complete = evidence.length > 0 && evidence.length === ctx.session.contract.checks.length
        return {
          output: JSON.stringify(evidence),
          verdict:
            failed || evidence.some((item) => item.verdict === "fail")
              ? "fail"
              : !complete || evidence.some((item) => item.verdict === "unknown")
                ? "unknown"
                : "pass",
          metadata: {
            verificationRunId: run.id,
            evidenceIds: run.evidenceIds,
            ...(complete
              ? {}
              : {
                  unknownReason:
                    "No checks or missing check results; configure a trusted goal check and inspect verification actions.",
                }),
          },
        }
      },
    }),
  )
  const loop = new AgentLoop({
    store,
    provider: options.provider ?? new OpenAICompatibleProvider(),
    context: new ContextManager(store, [], undefined, emit),
    registry,
    executor,
    verification,
    emit,
  })
  return {
    async create(input) {
      const workspace = await realpath(input.workspace)
      if (!input.goal.trim()) throw new NexusError("INPUT", "A goal is required")
      const project = await detect(workspace)
      const goalCheck = input.goalCheck ?? (input.mode === "answer" ? undefined : await inferGoalCheck(workspace, input.goal))
      const contract = createContract(redact(input.goal), project, input.mode ?? "coding", goalCheck)
      contract.trustManifest = await establishTrust(
        workspace,
        contract.checks.map((check) => check.argv),
        contract.revision,
      )
      contract.protectedFiles = contract.trustManifest.protected
      contract.generatedPaths = []
      contract.baselineFingerprint = inventoryFingerprint(await inventory(workspace))
      const session: AgentSession = {
        id: crypto.randomUUID(),
        workspace,
        goal: redact(input.goal),
        status: "INITIALIZING",
        version: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        conversation: [{ role: "user", content: redact(input.goal) }],
        plan: [],
        epoch: 0,
        epochStart: 0,
        summary: "",
        model: input.model,
        budgets: { ...defaultBudgets, ...input.budgets },
        turns: 0,
        toolCount: 0,
        activeMs: 0,
        contract,
        project,
        baseline: await gitBaseline(workspace),
        errors: [],
        ledgerId: "",
        evidenceStoreId: "",
        queuedPrompts: [],
        steerMessages: [],
      }
      session.ledgerId = session.id
      session.evidenceStoreId = session.id
      store.create(session)
      publish(store, session, emit, "created", {
        id: session.id,
        project: project.kind,
        model: session.model.model,
        branch: session.baseline.branch,
        contract,
      })
      return session
    },
    run: (id, signal) => loop.run(id, signal),
    prompt: (id, text, delivery = "STEER", messageId) => admit(store, id, text, delivery, messageId),
    sessions: () => store.sessions(),
    diff: (id) => agentChanges(store, id),
    rollback: (id, actionId, note, signal) => rollback(store, executor, emit, id, actionId, note, signal),
    inspect: (id) => ({
      session: store.get(id),
      actions: store.list("actions", id),
      evidence: store.list("evidence", id),
      events: store.list("events", id),
      inputs: store.list("queued_inputs", id),
      turns: store.list("turns", id),
      epochs: store.list("context_epochs", id),
      verification: store.list("verification_runs", id),
    }),
    async assertGoal(id, note) {
      const session = store.get(id)
      const release = store.acquire(id, session.workspace)
      try {
        if (!note.trim()) throw new NexusError("INPUT", "Describe the scenario you personally checked")
        store.put("evidence", {
          id: crypto.randomUUID(),
          sessionId: id,
          source: "user",
          timestamp: Date.now(),
          kind: "GOAL_ASSERTION",
          command: "user-confirmation",
          expected: session.goal,
          actual: redact(note),
          verdict: "pass",
          metadata: { manual: true },
          fingerprint: inventoryFingerprint(await inventory(session.workspace, session.contract.generatedPaths ?? [])),
          contractRevision: session.contract.revision,
        })
      } finally {
        release()
      }
    },
    resolveAction(id, actionId, outcome, note) {
      const session = store.get(id)
      const release = store.acquire(id, session.workspace)
      try {
        const action = store.record("actions", id, actionId)
        if (!action || action.status !== "UNKNOWN" || !note.trim())
          throw new NexusError("RECOVERY", "An UNKNOWN action and inspection note are required")
        store.put("actions", {
          ...action,
          status: outcome,
          error: undefined,
          result: { manualResolution: redact(note), previousResult: action.result },
        })
        publish(store, session, emit, "recovery", { actionId, outcome, note: redact(note) })
      } finally {
        release()
      }
    },
    async trustChecks(id, note) {
      const session = store.get(id)
      const release = store.acquire(id, session.workspace)
      try {
        if (!note.trim()) throw new NexusError("INPUT", "A review note is required")
        // A human reviewed the harness, so the boundary is re-established at the new revision.
        session.contract.revision++
        session.contract.trustManifest = await establishTrust(
          session.workspace,
          session.contract.checks.map((check) => check.argv),
          session.contract.revision,
        )
        session.contract.protectedFiles = session.contract.trustManifest.protected
        store.save(session)
        publish(store, session, emit, "trust_checks", { note: redact(note) })
      } finally {
        release()
      }
    },
    close: () => store.close(),
  }
}
