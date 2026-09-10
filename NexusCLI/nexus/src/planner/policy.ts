import type { PlanStep, TaskIntent } from "../domain/types"

/**
 * Planning policy.
 *
 * The observed failure is a report that reads "No explicit plan was recorded." after a multi-file
 * change. The opposite failure is just as bad: a five-step plan for "what is this file?" burns
 * turns a small model does not have.
 *
 * So planning is required by *intent and complexity*, not universally. This module decides which,
 * and produces the sentence that says so. It is guidance only:
 *
 *   - it never marks a step DONE (only evidence-backed `update_plan` can),
 *   - it never authorizes completion (only `CompletionPolicy` can),
 *   - it never blocks a tool call.
 *
 * Pure and deterministic, so the same goal always yields the same requirement.
 */

export type TaskComplexity = "small" | "medium" | "large"
export type PlanningRequirement = {
  required: boolean
  complexity: TaskComplexity
  workflow: string[]
  reason: string
  guidance: string
}

/** Workflow skeletons per task type. Mirrors `intelligence/intent` profiles and stays in sync with them. */
const workflows: Record<string, string[]> = {
  ANALYSIS: ["UNDERSTAND", "READ", "OUTPUT"],
  AUDIT: ["SCAN", "ANALYZE", "REPORT"],
  DEBUG: ["REPRODUCE", "DIAGNOSE", "EDIT", "VERIFY"],
  FEATURE: ["UNDERSTAND", "PLAN", "IMPLEMENT", "TEST"],
  REFACTOR: ["BASELINE", "REFACTOR", "PROVE_BEHAVIOUR_PRESERVED"],
}

const conjunctions = [
  "and then",
  "after that",
  " then ",
  " also ",
  " plus ",
  " затем ",
  " потом ",
  " также ",
  " и ещё ",
  " и еще ",
]

/**
 * Cheap structural complexity. Deliberately not a model call: a planning decision that needs a
 * model turn to be made has already spent the turn it was trying to save.
 */
export function taskComplexity(goal: string): TaskComplexity {
  const text = goal.trim()
  if (!text) return "small"
  const lower = text.toLowerCase()
  const words = text.split(/\s+/).filter(Boolean).length
  const enumerated = (text.match(/^\s*(?:[-*\u2022]|\d+[.)])\s+/gm) ?? []).length
  const sentences = (text.match(/[.!?\n]+/g) ?? []).length
  const paths = (text.match(/[\w./\\-]+\.[a-z]{1,5}\b/gi) ?? []).length
  const joined = conjunctions.filter((marker) => lower.includes(marker)).length
  const score =
    (words > 120 ? 3 : words > 45 ? 2 : words > 18 ? 1 : 0) +
    (enumerated >= 3 ? 2 : enumerated >= 1 ? 1 : 0) +
    (sentences >= 4 ? 1 : 0) +
    (paths >= 3 ? 1 : 0) +
    (joined >= 2 ? 2 : joined >= 1 ? 1 : 0)
  return score >= 4 ? "large" : score >= 2 ? "medium" : "small"
}

export function planningRequirement(input: {
  intent?: TaskIntent
  goal: string
  checks?: number
  plan?: readonly PlanStep[]
}): PlanningRequirement {
  const complexity = taskComplexity(input.goal)
  const type = input.intent?.type
  const workflow = (type ? workflows[type] : undefined) ?? input.intent?.workflow ?? []
  const mutating = input.intent ? input.intent.execution === "MUTATING" : true
  const existing = (input.plan ?? []).length
  const required =
    complexity === "large" || (mutating && complexity === "medium") || (type === "AUDIT" && complexity !== "small")
  const reason = required
    ? mutating
      ? `A ${complexity} ${type ?? "mutating"} task changes several things; an explicit plan is what makes partial progress reviewable`
      : `A ${complexity} ${type ?? "read-only"} task needs an explicit scan order to stay complete`
    : `A ${complexity} ${type ?? "task"} is cheaper to do directly than to plan`
  const steps = required
    ? existing
      ? "Keep the recorded plan current with update_plan; a step becomes DONE only when passing evidence exists for it."
      : "Record the plan with update_plan before the first mutating call. A step becomes DONE only when passing evidence exists for it."
    : "No explicit plan is needed; work directly and do not spend turns on planning."
  const guidance = [
    workflow.length ? `Workflow: ${workflow.join(" \u2192 ")}.` : "",
    `Task complexity: ${complexity}. ${steps}`,
    "A plan is progress tracking, never proof: completion is authorized by the completion policy from evidence alone.",
  ]
    .filter(Boolean)
    .join(" ")
  return { required, complexity, workflow, reason, guidance }
}
