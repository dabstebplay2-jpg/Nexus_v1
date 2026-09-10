import type { Store } from "../domain/ports"
import type { AgentSession, Message } from "../domain/types"
import { bound, safeJson } from "../shared/redact"
import { failureMemory } from "../intelligence/memory"

/**
 * L2 task memory: ledger facts and references, never a model's unverified success claim.
 *
 * Every read here is a bounded tail. It used to load the session's entire action and evidence
 * projections on every context build just to keep the last handful of rows, which made context
 * assembly grow with session length.
 *
 * The record is built as a typed value and serialised once, so the same session state always
 * produces the same bytes. Determinism matters twice over: the prompt has to be reproducible, and
 * an epoch snapshot has to be comparable to the one before it.
 */
export type TaskMemoryFailure = {
  tool: string
  command: string
  failures: number
  lastError: string
  recommendation: string
}
export type TaskMemoryRecord = {
  task: string
  revision: number
  userRequirements: string[]
  files: Array<{ path: unknown; hash: unknown; actionId?: string; evidenceId: string; kind: string }>
  changes: Array<{ path: string; actionId: string; status: string; beforeHash?: string; afterHash?: string }>
  checks: Array<{ id: string; checkId: unknown; verdict: string; revision: number }>
  plan: Array<{ id: string; description: string; state: string; evidence: string[] }>
  current: Array<{ id: string; tool: string; status: string; error?: string }>
  decision?: { outcome: string; missing: string[]; reason: string }
  /** Repeated failures of the same signature. Strategy learning is useless if the model cannot see it. */
  failures: TaskMemoryFailure[]
  history: { messages: number; actions: number; instruction: string }
}

/** Actions read to derive error memory. Bounded like every other read in this module. */
const failureWindow = 40
/** Distinct failing signatures worth spending prompt tokens on. Beyond a few, the pattern is the point. */
const failureRows = 3

export function taskMemoryRecord(store: Store, session: AgentSession, scale = 1): TaskMemoryRecord {
  const window = (rows: number) => Math.max(2, Math.floor(rows * scale))
  const fileEvidence = store.tail("evidence", session.id, window(6), {
    path: "$.kind",
    values: ["FILE_ASSERTION", "FILE_CHANGE"],
  })
  const writes = store.tail("actions", session.id, window(5), {
    path: "$.tool",
    values: ["write", "edit", "rollback"],
  })
  const checks = store.tail("evidence", session.id, window(4), { path: "$.source", values: ["verification"] })
  const current = store.tail("actions", session.id, 2)
  const failures = failureMemory(store.tail("actions", session.id, failureWindow))
  return {
    task: bound(session.goal, Math.max(400, Math.floor(1400 * scale))).text,
    revision: session.contract.revision,
    userRequirements: session.conversation.filter(message => message.role === "user").slice(-3).map(message => bound(message.content, Math.max(250, Math.floor(600 * scale))).text),
    files: fileEvidence.map(item => ({ path: item.metadata.path, hash: item.metadata.hash, actionId: item.actionId, evidenceId: item.id, kind: item.kind })),
    changes: writes.map(action => ({ path: action.target, actionId: action.id, status: action.status, beforeHash: action.beforeHash, afterHash: action.afterHash })),
    checks: checks.map(item => ({ id: item.id, checkId: item.metadata.checkId, verdict: item.verdict, revision: item.contractRevision })),
    plan: session.plan.slice(-6).map(step => ({ id: step.id, description: bound(step.description, 180).text, state: step.state, evidence: step.evidence.slice(-2) })),
    current: current.map(action => ({ id: action.id, tool: action.tool, status: action.status, error: action.error ? bound(action.error, 240).text : undefined })),
    decision: session.decision ? { outcome: session.decision.outcome, missing: session.decision.missing, reason: bound(session.decision.reason, 300).text } : undefined,
    failures: failures.filter(memory => memory.failures > 1).slice(0, failureRows).map(memory => ({ tool: memory.tool, command: bound(memory.command, 160).text, failures: memory.failures, lastError: bound(memory.lastError, 200).text, recommendation: memory.recommendation })),
    history: { messages: session.conversation.length, actions: store.count("actions", session.id), instruction: "L4 is durable. Use history for omitted user requirements and output(actionId) for full results. Hashes describe observations; reread before editing if stale." },
  }
}

export function taskMemory(store: Store, session: AgentSession, scale = 1) {
  return safeJson(taskMemoryRecord(store, session, scale))
}

/** Atomic conversation groups prevent orphan tool messages when an epoch is compressed. */
export function messageGroups(messages: Message[], start = 0) {
  const groups: { start: number; messages: Message[] }[] = []
  for (let index = start; index < messages.length; index++) {
    const message = messages[index]!
    if (message.role === "tool" && groups.at(-1)?.messages[0]?.toolCalls?.some(call => call.id === message.toolCallId)) {
      groups.at(-1)!.messages.push(message)
      continue
    }
    if (message.role === "tool") continue
    groups.push({ start: index, messages: [message] })
  }
  return groups.filter(group => !group.messages[0]!.toolCalls?.some(call => !group.messages.some(message => message.role === "tool" && message.toolCallId === call.id)))
}
