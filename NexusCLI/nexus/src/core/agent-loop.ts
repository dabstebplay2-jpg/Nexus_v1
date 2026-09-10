import type { AgentSession, PlanStep, ToolCall, Turn, VerificationRun } from "../domain/types"
import type { EventSink, Provider, Store } from "../domain/ports"
import type { ContextManager } from "../context/manager"
import type { ToolRegistry } from "../tools/registry"
import type { ToolExecutor } from "../tools/executor"
import type { VerificationEngine } from "../verification/engine"
import { completionPolicy } from "../completion/policy"
import { loopGuard } from "../loop-guard/policy"
import { toolAllowed } from "../intelligence/intent"
import { supervise } from "../intelligence/supervisor"
import { promote } from "../session/inbox"
import { recover } from "../recovery/policy"
import { inventory, inventoryFingerprint } from "../verification/delta"
import { abort, errorText, NexusError, createDeadline, isContextOverflow } from "../shared/errors"
import { bound, redact, safeJson } from "../shared/redact"
import { traceRootId, traceTurnId, type TraceNodeInput, type TraceStatus } from "../domain/trace"
import { thinkingSummary, type TraceRecorder } from "./trace"
import { publish, transition } from "./state"

export type LoopDependencies = {
  store: Store
  provider: Provider
  context: ContextManager
  registry: ToolRegistry
  executor: ToolExecutor
  verification: VerificationEngine
  emit: EventSink
  /**
   * Optional timeline recorder. It observes the loop, never steers it: every trace call below is
   * a statement about something that already happened, so omitting the recorder changes nothing
   * except that the timeline is empty.
   */
  trace?: TraceRecorder
}
export class AgentLoop {
  private readonly active = new Map<string, Promise<AgentSession>>()
  constructor(private readonly deps: LoopDependencies) {}
  run(id: string, signal: AbortSignal = new AbortController().signal) {
    const running = this.active.get(id)
    if (running) return running
    const execution = this.drain(id, signal).finally(() => this.active.delete(id))
    this.active.set(id, execution)
    return execution
  }
  private async drain(id: string, signal: AbortSignal) {
    const session = this.deps.store.get(id)
    const wasCompleted = session.status === "COMPLETED"
    let transientRetries = 0
    const release = this.deps.store.acquire(id, session.workspace)
    const started = Date.now()
    const elapsed = session.activeMs
    const deadline = AbortSignal.any([
      signal,
      AbortSignal.timeout(Math.max(1, session.budgets.maxDurationMs - elapsed)),
    ])
    const move = (status: AgentSession["status"], reason = "") =>
      transition(this.deps.store, session, status, this.deps.emit, reason)
    // Decisions are anchored to project source only, so generated output cannot stale evidence.
    const sourceFingerprint = async () =>
      inventoryFingerprint(await inventory(session.workspace, session.contract.generatedPaths ?? []))
    const rootId = traceRootId(id)
    const rootTitle = `Task: ${session.goal}`
    const trace = (node: TraceNodeInput) => this.deps.trace?.node(session, node)
    try {
      // The run's root scope. Re-published at the end with its outcome, which is how a resumed
      // session reattaches to the same tree instead of starting a second one.
      trace({
        id: rootId,
        type: "task",
        status: "running",
        title: rootTitle,
        metadata: {
          mode: session.contract.mode,
          model: session.model.model,
          project: session.project.kind,
          intent: session.intent?.type,
          resumed: wasCompleted,
        },
      })
      move("RECOVERING")
      const unknown = await recover(session, this.deps.store)
      if (unknown.length) {
        session.decision = {
          outcome: "BLOCKED",
          reason: "Inspect uncertain side effects with inspect-session/resolve-action; nothing was replayed",
          missing: unknown.map((action) => action.id),
        }
        publish(this.deps.store, session, this.deps.emit, "recovery", session.decision)
        move("FAILED", session.decision.reason)
        return session
      }
      session.errors = []
      // Reopening a proved task must not spend another model turn or replay tools.
      // Re-evaluate against current source, and never swallow newly admitted input.
      if (wasCompleted && !this.deps.store.list("queued_inputs", id).some((input) => !input.promoted)) {
        const decision = completionPolicy(
          session,
          this.deps.store.list("actions", id),
          this.deps.store.list("evidence", id),
          await sourceFingerprint(),
        )
        if (decision.outcome === "COMPLETE") {
          session.decision = decision
          move("VERIFYING", "Revalidate existing evidence against current source")
          move("COMPLETED", decision.reason)
          return session
        }
      }
      const reproduction = session.contract.criteria
        .filter((criterion) => criterion.baseline && criterion.checkId)
        .map((criterion) => criterion.checkId!)
      if (
        reproduction.length &&
        !this.deps.store
          .list("evidence", id)
          .some(
            (item) =>
              item.source === "verification" &&
              item.verdict === "fail" &&
              reproduction.includes(String(item.metadata.checkId)) &&
              item.fingerprint === session.contract.baselineFingerprint,
          )
      ) {
        move("VERIFYING", "Reproduce the reported failure before changing files")
        const reproductionId = `${id}:verification:reproduction`
        trace({
          id: reproductionId,
          parentId: rootId,
          type: "verification",
          status: "running",
          title: "Reproduce the reported failure",
          metadata: { checks: reproduction, baseline: true },
        })
        const reproduced = await this.deps.verification.run(
          session,
          deadline,
          () => move("WAITING_PERMISSION", "reproduction"),
          reproduction,
          reproductionId,
        )
        trace(this.verificationNode(session, reproduced, reproductionId, rootId, "Reproduce the reported failure"))
        if (session.status === "WAITING_PERMISSION") move("VERIFYING")
        move("RECOVERING")
      }
      move("UNDERSTANDING")
      move("PLANNING")
      while (true) {
        abort(deadline)
        session.activeMs = elapsed + Date.now() - started
        promote(this.deps.store, session, "STEER")
        const actions = this.deps.store.list("actions", id)
        const evidence = this.deps.store.list("evidence", id)
        const guard = loopGuard(session, actions, evidence)
        if (guard) publish(this.deps.store, session, this.deps.emit, "loop_guard", guard)
        const decision = supervise({ session, actions, evidence, guard })
        if (decision) {
          publish(this.deps.store, session, this.deps.emit, "supervisor", {
            action: decision.action,
            reason: decision.reason,
            source: decision.source,
          })
          if (decision.action === "STOP" || decision.action === "REQUEST_USER_INPUT") {
            session.decision = {
              outcome: decision.action === "STOP" ? "BLOCKED" : "NEEDS_USER_INPUT",
              reason: decision.reason,
              missing: [],
            }
            move("FAILED", decision.reason)
            break
          }
          // Error guidance may take precedence, but must not suppress requested compaction.
          if (guard?.action === "COMPACT_CONTEXT") this.deps.context.compact(session)
          session.conversation.push({
            role: "system",
            content: decision.guidance,
          })
        }
        move("ACTING")
        const snapshot = this.deps.registry.capture()
        const specs = snapshot.specs.filter((spec) => toolAllowed(session.intent, spec.name, session.contract.mode))
        const specTokens = this.deps.context.toolTokens(specs)
        const messages = await this.deps.context.build(session, specTokens)
        const turn: Turn = {
          id: crypto.randomUUID(),
          sessionId: id,
          number: ++session.turns,
          status: "STARTED",
          contextChars: safeJson(messages).length,
          contextTokens: this.deps.context.tokens(messages) + specTokens,
          model: session.model.model,
        }
        this.deps.store.transaction(() => {
          this.deps.store.put("turns", turn)
          this.deps.store.save(session)
        })
        publish(this.deps.store, session, this.deps.emit, "model_request", {
          turn: turn.number,
          model: turn.model,
          contextChars: turn.contextChars,
          contextTokens: turn.contextTokens,
          contextWindow: session.model.capabilities.contextLength,
          epoch: session.epoch,
        })
        const turnNode = traceTurnId(id, turn.number)
        trace({
          id: turnNode,
          parentId: rootId,
          type: "turn",
          status: "running",
          title: `Turn ${turn.number}`,
          metadata: { model: turn.model, epoch: session.epoch },
        })
        // Numbers and category names only, exactly like context_report: a context node must not
        // become a second way to leak the prompt.
        trace({
          id: `${turnNode}:context`,
          parentId: turnNode,
          type: "context_update",
          status: "success",
          title: "Context assembled",
          summary: `${turn.contextTokens} tokens of ${session.model.capabilities.contextLength}`,
          metadata: {
            epoch: session.epoch,
            contextTokens: turn.contextTokens,
            contextChars: turn.contextChars,
            contextWindow: session.model.capabilities.contextLength,
            stage: session.context?.stage,
            mode: session.context?.mode,
            utilisation: session.context?.report?.utilisation,
          },
        })
        const calls: ToolCall[] = []
        const parts: string[] = []
        const streamState = { finished: false }
        const providerDeadline = createDeadline(deadline, session.budgets.providerTimeoutMs)
        try {
          for await (const event of this.deps.provider.stream({
            model: session.model,
            messages,
            tools: specs,
            maxTokens: this.deps.context.budget(session).output,
            signal: providerDeadline.signal,
          })) {
            abort(deadline)
            if (event.type === "text") {
              parts.push(event.text)
              if (parts.join("").length > 1000000) throw new NexusError("OUTPUT_LIMIT", "Provider output too large")
            }
            if (event.type === "tool") calls.push(event.call)
            if (event.type === "finish") streamState.finished = true
            if (event.type === "usage") publish(this.deps.store, session, this.deps.emit, "usage", event)
          }
          if (!streamState.finished) throw new NexusError("PROTOCOL", "Incomplete provider turn")
          if (new Set(calls.map((call) => call.id)).size !== calls.length || calls.length > 64)
            throw new NexusError("PROTOCOL", "Duplicate or excessive tool calls")
          const priorIds = new Set(
            session.conversation.flatMap((message) => message.toolCalls ?? []).map((call) => call.id),
          )
          if (calls.some((call) => priorIds.has(call.id)))
            throw new NexusError("PROTOCOL", "Tool call ID was already used in an earlier turn")
          if (calls.length && (!specs.length || !session.model.capabilities.toolCalling))
            throw new NexusError("CAPABILITY", "Tools are unavailable in this mode/model")
          turn.status = "SUCCEEDED"
          transientRetries = 0
          if (session.context) session.context.failures = 0
        } catch (error) {
          turn.status = "FAILED"
          turn.error = redact(errorText(error))
          this.deps.store.put("turns", turn)
          if (isContextOverflow(error)) {
            // A rejected request executed no tools. Keep its Turn audit record but do not
            // consume a work-turn budget merely to compress and retry the same turn.
            session.turns--
            move("RECOVERING", "Context overflow: compress and resume without replaying tools")
            const retry = this.deps.context.recoverOverflow(session)
            publish(this.deps.store, session, this.deps.emit, "recovery", { code: "CONTEXT_OVERFLOW", action: "COMPRESS_CONTEXT", retry, turnId: turn.id })
            trace({
              id: `${turnNode}:context:overflow`,
              parentId: turnNode,
              type: "context_update",
              status: retry ? "running" : "failed",
              title: "Context overflow: compressed and resumed",
              metadata: { retry, epoch: session.epoch, turnId: turn.id },
            })
            if (retry) continue
            throw new NexusError("CONTEXT_CAPACITY", "Provider repeatedly rejected compressed context. History and changes are saved; adjust context configuration and resume.")
          }
          if (error instanceof NexusError && error.retryable && transientRetries++ < 2 && !deadline.aborted) {
            session.turns--
            move("RECOVERING", "Transient provider failure; retry the unexecuted turn")
            publish(this.deps.store, session, this.deps.emit, "recovery", { code: error.code, action: "RETRY_PROVIDER", attempt: transientRetries, turnId: turn.id })
            continue
          }
          trace({
            id: turnNode,
            parentId: rootId,
            type: "turn",
            status: "failed",
            title: `Turn ${turn.number}`,
            ...(turn.error ? { summary: turn.error } : {}),
            metadata: { model: turn.model, error: turn.error },
          })
          throw error
        } finally {
          providerDeadline.close()
        }
        this.deps.store.put("turns", turn)
        session.conversation.push({
          role: "assistant",
          content: redact(parts.join("")),
          ...(calls.length ? { toolCalls: JSON.parse(safeJson(calls)) as ToolCall[] } : {}),
        })
        this.deps.store.save(session)
        // A summary of text the model already sent to the user. Not a chain of thought: nothing
        // hidden is requested or recorded, and no decision below reads this node.
        const narration = parts.join("").trim()
        if (narration)
          trace({
            id: `${turnNode}:thinking`,
            parentId: turnNode,
            type: "thinking",
            status: "success",
            title: "Thinking summary",
            summary: thinkingSummary(narration),
            metadata: {
              advisory: true,
              influencesCompletion: false,
              source: "assistant_message",
              chars: narration.length,
            },
          })
        const planBefore = planFingerprint(session.plan)
        const observed: { tool: string; status: string }[] = []
        for (const call of calls) {
          abort(deadline)
          if (session.toolCount >= session.budgets.maxTools) throw new NexusError("BUDGET", "Tool budget exhausted")
          const result = await this.deps.executor.execute(
            session,
            turn.id,
            call,
            snapshot.resolve(call.name),
            deadline,
            () => move("WAITING_PERMISSION", call.name),
            undefined,
            turnNode,
          )
          observed.push({ tool: call.name, status: result.action.status })
          session.conversation.push({ role: "tool", toolCallId: call.id, content: result.output })
          this.deps.store.save(session)
          publish(this.deps.store, session, this.deps.emit, "tool", {
            name: call.name,
            actionId: result.action.id,
            status: result.action.status,
            output: bound(result.output, 1600).text,
          })
          if (result.action.status === "UNKNOWN")
            throw new NexusError("UNKNOWN_EFFECT", "Side effect has uncertain outcome; inspect before resuming")
          if (session.status === "WAITING_PERMISSION") move("ACTING")
        }
        // The plan is owned by the update_plan tool; this only reports that it changed.
        if (planFingerprint(session.plan) !== planBefore) trace(planNode(turnNode, session.plan))
        move("OBSERVING")
        trace({
          id: `${turnNode}:observation`,
          parentId: turnNode,
          type: "observation",
          status: "success",
          title: calls.length
            ? `Observed ${calls.length} tool result${calls.length === 1 ? "" : "s"}`
            : "No tool calls this turn",
          ...(observed.length
            ? { summary: observed.map((item) => `${item.tool}: ${item.status}`).join(", ") }
            : {}),
          metadata: {
            toolCalls: calls.length,
            results: observed,
            failed: observed.filter((item) => item.status === "FAILED").length,
          },
        })
        trace({
          id: turnNode,
          parentId: rootId,
          type: "turn",
          status: turn.status === "SUCCEEDED" ? "success" : "failed",
          title: `Turn ${turn.number}`,
          metadata: { model: turn.model, toolCalls: calls.length },
        })
        if (calls.length) continue
        move("VERIFYING")
        if (session.contract.mode === "answer" && parts.join("").trim())
          this.deps.store.put("evidence", {
            id: crypto.randomUUID(),
            sessionId: id,
            source: "core",
            timestamp: Date.now(),
            kind: "GOAL_ASSERTION",
            command: "answer-delivered",
            expected: "Non-empty response",
            actual: parts.join(""),
            verdict: "pass",
            metadata: { informational: true },
            fingerprint: await sourceFingerprint(),
            contractRevision: session.contract.revision,
          })
        const beforeVerification = completionPolicy(
          session,
          this.deps.store.list("actions", id),
          this.deps.store.list("evidence", id),
          await sourceFingerprint(),
        )
        if (session.contract.mode === "coding" && beforeVerification.outcome === "NEEDS_VERIFICATION") {
          const verificationId = `${turnNode}:verification`
          trace({
            id: verificationId,
            parentId: rootId,
            type: "verification",
            status: "running",
            title: "Run trusted checks",
            metadata: { turn: turn.number, checks: session.contract.checks.map((check) => check.id) },
          })
          const run = await this.deps.verification.run(
            session,
            deadline,
            () => move("WAITING_PERMISSION", "verification"),
            undefined,
            verificationId,
          )
          trace(this.verificationNode(session, run, verificationId, rootId, "Run trusted checks"))
        }
        if (session.status === "WAITING_PERMISSION") move("VERIFYING")
        const completion = completionPolicy(
          session,
          this.deps.store.list("actions", id),
          this.deps.store.list("evidence", id),
          await sourceFingerprint(),
        )
        session.decision = completion
        publish(this.deps.store, session, this.deps.emit, "completion", session.decision)
        // Reported, not decided: the status below is a rendering of the policy's own outcome.
        trace({
          id: `${turnNode}:completion`,
          parentId: rootId,
          type: "completion",
          status:
            completion.outcome === "COMPLETE"
              ? "success"
              : completion.outcome === "INCOMPLETE" || completion.outcome === "NEEDS_VERIFICATION"
                ? "running"
                : "failed",
          title: `Completion: ${completion.outcome}`,
          summary: completion.reason,
          metadata: {
            outcome: completion.outcome,
            missing: completion.missing,
            authorizedBy: "completion_policy",
            turn: turn.number,
          },
        })
        // Recheck durable admission after verification, which may have taken minutes.
        if (promote(this.deps.store, session, "STEER")) {
          move("ACTING")
          continue
        }
        if (session.decision?.outcome === "COMPLETE") {
          if (promote(this.deps.store, session, "QUEUE")) {
            move("ACTING")
            continue
          }
          move("COMPLETED", session.decision.reason)
          break
        }
        if (session.decision?.outcome === "UNKNOWN") {
          move("UNKNOWN", session.decision.reason)
          break
        }
        if (["NEEDS_USER_INPUT", "BLOCKED"].includes(session.decision?.outcome ?? "")) {
          move("FAILED", session.decision?.reason)
          break
        }
        session.conversation.push({
          role: "system",
          content: `Completion rejected: ${safeJson(session.decision)}. Inspect evidence, fix failures or finish your plan; then verify.`,
        })
        move("RECOVERING", "Completion rejected")
      }
    } catch (error) {
      const message = redact(errorText(error))
      session.errors.push(message)
      session.decision = {
        outcome: error instanceof NexusError && (error.code.startsWith("PERMISSION") || error.code === "CONTEXT_CAPACITY") ? "NEEDS_USER_INPUT" : "BLOCKED",
        reason: message,
        missing: [],
      }
      publish(this.deps.store, session, this.deps.emit, "error", {
        code: error instanceof NexusError ? error.code : "UNEXPECTED",
        message,
      })
      move(
        signal.aborted
          ? "ABORTED"
          : error instanceof NexusError && error.code === "PERMISSION_REQUIRED"
            ? "WAITING_PERMISSION"
            : error instanceof NexusError && error.code === "CONTEXT_CAPACITY" ? "WAITING_CONTEXT" : "FAILED",
        message,
      )
    } finally {
      session.activeMs = elapsed + Date.now() - started
      try {
        trace({
          id: rootId,
          type: "task",
          status:
            session.status === "COMPLETED"
              ? "success"
              : ["FAILED", "ABORTED", "UNKNOWN"].includes(session.status)
                ? "failed"
                : "running",
          title: rootTitle,
          ...(session.decision ? { summary: session.decision.reason } : {}),
          metadata: {
            status: session.status,
            outcome: session.decision?.outcome,
            turns: session.turns,
            tools: session.toolCount,
            activeMs: session.activeMs,
          },
        })
      } catch {
        // A timeline node must never replace the outcome of the run it describes.
      }
      this.deps.store.save(session)
      release()
    }
    return session
  }
  /**
   * Display status for a finished verification run. It reads the evidence the engine already
   * wrote; the completion policy reaches its own conclusion from the same records, so this can
   * never widen or soften what was proved.
   */
  private verificationNode(
    session: AgentSession,
    run: VerificationRun,
    id: string,
    parentId: string,
    title: string,
  ): TraceNodeInput {
    const evidence = this.deps.store.list("evidence", session.id).filter((item) => run.evidenceIds.includes(item.id))
    const passed = evidence.filter((item) => item.verdict === "pass").length
    const status: TraceStatus = !evidence.length ? "pending" : passed === evidence.length ? "success" : "failed"
    return {
      id,
      parentId,
      type: "verification",
      status,
      title,
      summary: evidence.length
        ? `${passed}/${evidence.length} trusted checks passed`
        : "No trusted check produced evidence",
      metadata: {
        runId: run.id,
        checks: evidence.map((item) => ({
          checkId: item.metadata.checkId,
          verdict: item.verdict,
          evidenceId: item.id,
        })),
      },
    }
  }
}
/** Plan revisions are detected by value, so a `plan` node is published only when it changed. */
const planFingerprint = (plan: PlanStep[]) => plan.map((step) => `${step.id}:${step.state}`).join("|")
function planNode(parentId: string, plan: PlanStep[]): TraceNodeInput {
  const done = plan.filter((step) => step.state === "DONE").length
  return {
    id: `${parentId}:plan`,
    parentId,
    type: "plan",
    status: plan.some((step) => step.state === "BLOCKED")
      ? "failed"
      : plan.length > 0 && done === plan.length
        ? "success"
        : "running",
    title: "Plan updated",
    summary: `${done}/${plan.length} steps done`,
    metadata: {
      total: plan.length,
      steps: plan.slice(0, 20).map((step) => ({
        id: step.id,
        description: step.description,
        state: step.state,
        attempts: step.attempts,
      })),
    },
  }
}
