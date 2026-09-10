import type { Action, AgentSession, Evidence } from "../domain/types"
import type { GuardDecision } from "../loop-guard/policy"
import { REPEAT_LIMIT, TERMINAL_LIMIT, failureBriefing, worstFailure, type ToolFailureMemory } from "./memory"

/**
 * Supervisor: the strategy layer above the loop.
 *
 * The loop is the Executor, `planner/plan` plus the `update_plan` tool are the Planner, and
 * VerificationEngine plus CompletionPolicy are the Reviewer. None of them ever asks "are we stuck?"
 * -- each one only judges the step in front of it. The Supervisor is the component that does, and
 * it is deliberately the only new component with authority over the loop's control flow.
 *
 * Two hard rules keep this safe:
 *  1. It never authorises completion. It can stop a run and it can redirect one; it cannot finish
 *     one. CompletionPolicy remains the sole authoriser of COMPLETED.
 *  2. It never weakens LoopGuard. Every LoopGuard decision is still honoured, including the exact
 *     guidance text the loop used before, so existing behaviour is preserved verbatim.
 *
 * What it adds is the cross-window judgement LoopGuard structurally cannot make: repeated failure
 * of one signature across the whole session, rather than similarity within the last eight actions.
 */
export type SupervisorAction =
  "DIAGNOSE" | "CHANGE_STRATEGY" | "COMPACT_CONTEXT" | "REPLAN" | "REQUEST_USER_INPUT" | "STOP"
export type SupervisorDecision = {
  action: SupervisorAction
  reason: string
  source: "loop-guard" | "error-memory"
  /** Injected into the transcript verbatim when the run continues. */
  guidance: string
  memory?: ToolFailureMemory
}

/** Preserves v0.2.2 wording exactly, so a LoopGuard-driven turn is indistinguishable from before. */
const fromGuard = (guard: GuardDecision): SupervisorDecision => ({
  action: guard.action,
  reason: guard.reason,
  source: "loop-guard",
  guidance: `${guard.action}: ${guard.reason}. Choose a different action; do not repeat the loop.`,
})

export function supervise(input: {
  session: AgentSession
  actions: Action[]
  evidence: Evidence[]
  guard?: GuardDecision
}): SupervisorDecision | undefined {
  // Budget exhaustion and post-diagnosis repetition are terminal; nothing outranks them.
  if (input.guard?.action === "STOP") return fromGuard(input.guard)
  const worst = worstFailure(input.actions)
  if (worst && worst.failures >= TERMINAL_LIMIT)
    return {
      action: "REQUEST_USER_INPUT",
      reason: `${failureBriefing(worst)} The agent stopped instead of spending the rest of the budget on it.`,
      source: "error-memory",
      guidance: "",
      memory: worst,
    }
  // A signature that keeps failing is a stronger signal than "the last three calls looked alike",
  // so it replaces the generic guard message with one naming the command and its error.
  if (worst && worst.failures >= REPEAT_LIMIT)
    return {
      action: "CHANGE_STRATEGY",
      reason: failureBriefing(worst),
      source: "error-memory",
      guidance: `${failureBriefing(worst)} Do not run it again. Either take a different approach, or explain what you cannot determine and ask the user for input.`,
      memory: worst,
    }
  if (input.guard) return fromGuard(input.guard)
  return undefined
}
