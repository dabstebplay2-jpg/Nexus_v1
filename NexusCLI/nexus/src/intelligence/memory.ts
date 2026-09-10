import type { Action } from "../domain/types"
import { canonical } from "../loop-guard/policy"

/**
 * Error memory.
 *
 * LoopGuard already notices that the *last* few actions look alike, but it reads a sliding window
 * of eight and it counts signatures, not failures. An agent that fails, reads a file, fails again,
 * reads another file and fails again never fills that window, so it keeps burning the execution
 * budget on the same broken command.
 *
 * This module answers a different question: for each distinct action signature, how many times has
 * it failed since the last time it succeeded? It is derived entirely from the durable `actions`
 * projection, so it needs no new table, survives restarts for free, and cannot drift from the
 * ledger it is summarising.
 */

/** Failures of one signature before the agent must change approach. */
export const REPEAT_LIMIT = 3
/** Failures of one signature before the run stops and asks the operator. */
export const TERMINAL_LIMIT = 5

export type FailureRecommendation = "retry" | "change strategy" | "request user input"
export type ToolFailureMemory = {
  tool: string
  /** The shell command for `bash`, the canonical arguments otherwise. */
  command: string
  signature: string
  failures: number
  lastError: string
  firstFailedAt: number
  lastFailedAt: number
  actionIds: string[]
  recommendation: FailureRecommendation
}

const commandOf = (action: Action) => {
  const args = action.arguments
  const command = args && typeof args === "object" && "command" in args ? String(args.command) : canonical(args)
  return command.slice(0, 400)
}
const signatureOf = (action: Action) => `${action.tool}:${canonical(action.arguments)}`
const recommend = (failures: number): FailureRecommendation =>
  failures >= TERMINAL_LIMIT ? "request user input" : failures >= REPEAT_LIMIT ? "change strategy" : "retry"

/**
 * Failure counts per signature, worst first. A success clears its signature: an action that works
 * once is not evidence of a stuck agent, however often it failed before.
 */
export function failureMemory(actions: Action[]): ToolFailureMemory[] {
  const grouped = actions.reduce((memory, action) => {
    const signature = signatureOf(action)
    if (["SUCCEEDED", "VERIFIED"].includes(action.status)) memory.delete(signature)
    if (action.status !== "FAILED") return memory
    const previous = memory.get(signature)
    const failures = (previous?.failures ?? 0) + 1
    memory.set(signature, {
      tool: action.tool,
      command: commandOf(action),
      signature,
      failures,
      lastError: (action.error ?? canonical(action.result)).slice(0, 600),
      firstFailedAt: previous?.firstFailedAt ?? action.startedAt,
      lastFailedAt: action.finishedAt ?? action.startedAt,
      actionIds: [...(previous?.actionIds ?? []), action.id].slice(-TERMINAL_LIMIT),
      recommendation: recommend(failures),
    })
    return memory
  }, new Map<string, ToolFailureMemory>())
  return [...grouped.values()].sort((a, b) => b.failures - a.failures || b.lastFailedAt - a.lastFailedAt)
}

/** The signature closest to exhausting the agent's patience, if any signature has failed at all. */
export const worstFailure = (actions: Action[]): ToolFailureMemory | undefined => failureMemory(actions).at(0)

/** One line the model can act on. Kept short: it is injected into a context that is already tight. */
export const failureBriefing = (memory: ToolFailureMemory) =>
  `${memory.tool} "${memory.command}" has failed ${memory.failures} times with the same arguments. Last error: ${memory.lastError}`
