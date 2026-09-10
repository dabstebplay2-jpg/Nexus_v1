import type { Store } from "../domain/ports"
import type { Action, AgentSession, Evidence, ToolCall } from "../domain/types"
import type { PermissionEngine } from "../permissions/engine"
import type { SandboxProvider } from "../sandbox/ports"
import type { Tool } from "./registry"
import { abort, errorText, NexusError } from "../shared/errors"
import { bound, redact, safeJson } from "../shared/redact"

export class ToolExecutor {
  constructor(
    private readonly store: Store,
    private readonly permissions: PermissionEngine,
    private readonly sandbox: SandboxProvider,
  ) {}
  async execute(
    session: AgentSession,
    turnId: string,
    call: ToolCall,
    tool: Tool,
    signal: AbortSignal,
    waiting: () => void,
    verification?: { fingerprint: string; checkId: string },
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
    try {
      abort(signal)
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
          actionId: action.id,
          tool: tool.name,
          arguments: action.arguments,
          capabilities,
          reason: tool.description,
        },
        signal,
        waiting,
      )
      action.status = "STARTED"
      this.store.put("actions", action)
      const result = await tool.execute(input, {
        session,
        store: this.store,
        sandbox: this.sandbox,
        signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(tool.timeout, session.budgets.toolTimeoutMs))]),
        actionId: action.id,
        waiting,
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
