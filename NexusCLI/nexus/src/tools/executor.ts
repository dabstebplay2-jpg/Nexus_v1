import type { Store } from "../domain/ports"
import type { Action, AgentSession, Evidence, ToolCall } from "../domain/types"
import type { PermissionEngine } from "../permissions/engine"
import type { SandboxProvider } from "../sandbox/ports"
import type { TraceRecorder } from "../core/trace"
import type { Tool } from "./registry"
import { traceRootId } from "../domain/trace"
import { toolAllowed } from "../intelligence/intent"
import { abort, errorText, NexusError } from "../shared/errors"
import { bound, redact, safeJson } from "../shared/redact"

export class ToolExecutor {
  constructor(
    private readonly store: Store,
    private readonly permissions: PermissionEngine,
    private readonly sandbox: SandboxProvider,
    /** Optional. Without a recorder the executor behaves exactly as before and traces nothing. */
    private readonly trace?: TraceRecorder,
  ) {}
  async execute(
    session: AgentSession,
    turnId: string,
    call: ToolCall,
    tool: Tool,
    signal: AbortSignal,
    waiting: () => void,
    verification?: { fingerprint: string; checkId: string },
    /** Trace node this call hangs from. Defaults to the run's root scope. */
    traceParentId: string = traceRootId(session.id),
  ) {
    if (session.toolCount >= session.budgets.maxTools) throw new NexusError("BUDGET", "Tool budget exhausted")
    const action: Action = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      turnId,
      type: verification ? "verification" : "tool",
      tool: tool.name,
      implementation: `${tool.name}@${tool.version}`,
      target:
        typeof call.arguments === "object" && call.arguments && "path" in call.arguments
          ? String(call.arguments.path)
          : "",
      reason: tool.description,
      arguments: JSON.parse(safeJson(call.arguments)),
      risk: tool.risk,
      sideEffect: tool.sideEffect,
      status: "PLANNED",
      startedAt: Date.now(),
      evidenceIds: [],
    }
    this.store.put("actions", action)
    action.callId = call.id
    this.store.put("actions", action)
    session.toolCount++
    this.store.save(session)
    // One tool call, one trace node, opened before anything can reject it: a call that is denied
    // or fails input validation still appears in the timeline instead of vanishing.
    const trace = this.trace?.tool(session, {
      actionId: action.id,
      parentId: traceParentId,
      tool: tool.name,
      title: `${verification ? "Verify" : "Tool"}: ${tool.name}`,
      input: action.arguments,
      metadata: {
        callId: call.id,
        turnId,
        risk: action.risk,
        sideEffect: action.sideEffect,
        ...(verification ? { checkId: verification.checkId } : {}),
      },
    })
    trace?.requested()
    try {
      abort(signal)
      if (!toolAllowed(session.intent, tool.name, session.contract.mode))
        throw new NexusError(
          "BOUNDARY",
          `Tool ${tool.name} is unavailable: this task is classified ${session.intent?.type ?? "UNKNOWN"} and runs read-only. Allowed tools: ${(session.intent?.allowedTools ?? []).join(", ")}. Use one of those, or answer with what you already have.`,
        )
      const input = tool.inputSchema.parse(call.arguments)
      const capabilities = tool.permissions(input)
      if (capabilities.length && capabilities.every((capability) => capability === "READ")) {
        action.risk = "low"
        action.sideEffect = false
        this.store.put("actions", action)
      }
      await this.permissions.authorize(
        {
          sessionId: session.id,
          workspace: session.workspace,
          actionId: action.id,
          tool: tool.name,
          arguments: action.arguments,
          capabilities,
          reason: tool.description,
        },
        signal,
        // The engine decides; the trace only records that a human was asked and when.
        () => {
          trace?.waitingPermission(
            `${tool.name} needs approval for ${capabilities.join(", ") || "an unclassified capability"}`,
          )
          waiting()
        },
      )
      trace?.permissionResolved(true)
      action.status = "STARTED"
      this.store.put("actions", action)
      trace?.started()
      const result = await tool.execute(input, {
        session,
        store: this.store,
        sandbox: this.sandbox,
        signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(tool.timeout, session.budgets.toolTimeoutMs))]),
        actionId: action.id,
        waiting,
        progress: (output: string) => trace?.streaming(output),
      })
      const safe = JSON.parse(safeJson(result)) as typeof result
      const evidence: Evidence = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        actionId: action.id,
        source: verification ? "verification" : "tool",
        timestamp: Date.now(),
        kind: safe.kind ?? "COMMAND_RESULT",
        command: tool.name,
        expected: verification ? "Trusted check exits with code 0 without changing source files" : "Tool succeeds",
        actual: safe.metadata ?? safe.output,
        verdict: safe.verdict ?? "pass",
        metadata: { ...safe.metadata, ...(verification ? { checkId: verification.checkId } : {}) },
        rawOutput: safe.output,
        fingerprint: verification?.fingerprint,
        contractRevision: session.contract.revision,
      }
      action.status = evidence.verdict === "fail" ? "FAILED" : "SUCCEEDED"
      if (action.status === "FAILED")
        action.error = redact(
          `Operation ${tool.name} failed: ${safeJson(action.arguments)}. ${String(safe.metadata?.failureReason ?? "Inspect the output, correct the cause, and run verification again.")} ${String(safe.metadata?.stderr ?? "")}`,
        )
      action.result = safe
      action.beforeHash = safe.beforeHash
      action.afterHash = safe.afterHash
      action.finishedAt = Date.now()
      action.evidenceIds = [evidence.id]
      this.store.transaction(() => {
        this.store.put("evidence", evidence)
        this.store.put("actions", action)
      })
      // The Response half of the pair. Bounded independently of the model-facing output, because
      // this copy is rendered rather than reasoned over.
      const metadata = safe.metadata ?? {}
      const exitCode = metadata.exitCode
      const response = bound(safe.output, 1200)
      const traceMetadata: Record<string, unknown> = {
        actionId: action.id,
        evidenceId: evidence.id,
        verdict: evidence.verdict,
        kind: evidence.kind,
        status: action.status,
        durationMs: (action.finishedAt ?? Date.now()) - action.startedAt,
        outputChars: response.totalChars,
        truncated: response.truncated,
        ...(typeof exitCode === "number" ? { exitCode } : {}),
      }
      if (action.status === "FAILED")
        trace?.failed(action.error ?? `${tool.name} reported a failing verdict`, response.text, traceMetadata)
      else trace?.completed(response.text, traceMetadata)
      // A diff node states *that* a file changed and proves it with the hashes already recorded on
      // the action. File contents stay in the ledger and are served by the existing diff endpoint.
      if (action.beforeHash || action.afterHash) {
        const after = metadata.after
        trace?.diff(`Changed ${String(metadata.path ?? action.target ?? tool.name)}`, {
          path: metadata.path ?? action.target,
          beforeHash: action.beforeHash,
          afterHash: action.afterHash,
          created: metadata.created === true,
          ...(typeof after === "string" ? { bytes: after.length } : {}),
        })
      }
      return {
        action,
        evidence,
        output: safeJson({
          ...bound(safe.output),
          actionId: action.id,
          evidenceId: evidence.id,
          metadata: safe.metadata ? bound(safeJson(safe.metadata), 2500).text : undefined,
        }),
      }
    } catch (error) {
      const stored = this.store.record("actions", session.id, action.id) ?? action
      const beforeMutation =
        error instanceof NexusError &&
        ["FILE_CONFLICT", "EDIT_MATCH", "BOUNDARY", "SECRET", "INPUT", "FILE_LIMIT", "PROCESS_START_FAILED"].includes(
          error.code,
        )
      stored.status = stored.status === "STARTED" && stored.sideEffect && !beforeMutation ? "UNKNOWN" : "FAILED"
      stored.error = redact(errorText(error))
      stored.finishedAt = Date.now()
      this.store.put("actions", stored)
      if (error instanceof NexusError && error.code === "PERMISSION_DENIED")
        trace?.permissionResolved(false, stored.error)
      trace?.failed(stored.error ?? errorText(error), undefined, {
        actionId: action.id,
        status: stored.status,
        code: error instanceof NexusError ? error.code : "UNEXPECTED",
      })
      if (
        error instanceof NexusError &&
        ["PERMISSION_REQUIRED", "PERMISSION_DENIED", "UNKNOWN_EFFECT"].includes(error.code)
      )
        throw error
      if (signal.aborted) throw error
      return { action: stored, output: safeJson({ actionId: action.id, error: stored.error, status: stored.status }) }
    }
  }
}
