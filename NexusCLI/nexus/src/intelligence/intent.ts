import type { Contract, TaskIntent, TaskType } from "../domain/types"
import { classifyIntent } from "../completion/intent"

/**
 * Task intent classification: what kind of proof does this request need, and with which tools?
 *
 * Phase 0 gave every request the same shape -- a coding contract whose criteria can only be
 * discharged by running the project's trusted checks. That is right for repair work and wrong for
 * "show me the structure": the agent is forced to build and test a tree it was never asked to
 * touch, and CompletionPolicy correctly refuses to finish until it does.
 *
 * This layer runs once, before the loop, and answers two questions: which workflow the task
 * belongs to, and which tools may be used. It deliberately does NOT decide completion. Read-only
 * tasks are routed onto the contract mode that already exists (`answer`), so CompletionPolicy
 * stays the single authority and no task gets a private path to COMPLETED.
 *
 * Bias, on purpose: only decisive vocabulary demotes a task to READ_ONLY. Anything ambiguous keeps
 * the pre-existing mutating, verification-required behaviour, because wrongly dropping a proof is
 * worse than wrongly demanding one. The single exception is an explicit refusal to change files
 * ("не меняй ничего", "don't change anything"): that is a direct user instruction and outranks the
 * rest of the vocabulary. A caller that needs to override it passes an explicit contract mode.
 */

/** The read-only surface: list/read/search/history/output, plus their pure siblings. */
export const READ_ONLY_TOOLS = ["list", "glob", "search", "read", "retrieve", "history", "output"]

/** Matched as whole words: prefix matching would turn "неверный" into a negation. */
const negations = new Set([
  "не",
  "нет",
  "без",
  "ничего",
  "никак",
  "no",
  "not",
  "never",
  "don",
  "dont",
  "without",
  "avoid",
])
const mutationStems = ["меня", "измен", "правк", "трога", "change", "modif", "edit", "touch", "rewrit", "patch", "writ"]
const readOnlyPhrases = [
  "read only",
  "read-only",
  "только чтение",
  "без изменений",
  "don't change",
  "do not change",
  "don't modify",
  "do not modify",
  "without changing",
]
const refactorStems = [
  "refactor",
  "рефактор",
  "переимен",
  "rename",
  "cleanup",
  "почист",
  "очист",
  "упрост",
  "simplif",
  "extract",
  "извлеч",
  "dedup",
  "реорганиз",
  "reorganiz",
  "restructur",
  "modulariz",
]
const featureStems = [
  "add",
  "implement",
  "creat",
  "созда",
  "добав",
  "реализ",
  "support",
  "внедр",
  "build",
  "напиш",
  "writ",
  "generat",
  "генер",
  "scaffold",
  "migrat",
  "integrat",
  "feature",
  "фича",
  "функционал",
  "поддерж",
]
const auditStems = [
  "audit",
  "аудит",
  "scan",
  "скан",
  "review",
  "ревью",
  "secur",
  "безопасн",
  "уязвим",
  "vulnerab",
  "complian",
  "долг",
]
const analysisStems = [
  "explain",
  "describ",
  "summar",
  "overview",
  "architect",
  "structur",
  "understand",
  "analyz",
  "analys",
  "diagram",
  "объясн",
  "расскаж",
  "покаж",
  "опиш",
  "обзор",
  "структур",
  "архитектур",
  "анализ",
]
/**
 * Interrogatives are matched as whole words. As prefixes they are far too greedy: "что" swallows
 * "чтобы", which turns every "измени так, чтобы ..." instruction into a question.
 */
const questionWords = new Set([
  "что",
  "почему",
  "зачем",
  "как",
  "какой",
  "какая",
  "какие",
  "где",
  "why",
  "what",
  "how",
  "where",
  "which",
])

const tokenise = (goal: string) =>
  goal
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

const hits = (tokens: string[], stems: string[]) => tokens.some((token) => stems.some((stem) => token.startsWith(stem)))

/**
 * A refusal to change files. The token rule requires the negation to precede the mutation word
 * within a short window, so "измени так, чтобы не ломать API" is not mistaken for a read-only
 * request, while "не меняй ничего" and "ничего не меняй" both are.
 */
const forbidsMutation = (goal: string, tokens: string[]) =>
  readOnlyPhrases.some((phrase) => goal.toLowerCase().includes(phrase)) ||
  tokens.some(
    (token, index) =>
      negations.has(token) &&
      tokens.slice(index + 1, index + 4).some((next) => mutationStems.some((stem) => next.startsWith(stem))),
  )

const profiles: Record<TaskType, { execution: TaskIntent["execution"]; workflow: string[] }> = {
  ANALYSIS: { execution: "READ_ONLY", workflow: ["UNDERSTAND", "READ", "OUTPUT"] },
  AUDIT: { execution: "READ_ONLY", workflow: ["SCAN", "ANALYZE", "REPORT"] },
  DEBUG: { execution: "MUTATING", workflow: ["REPRODUCE", "PLAN", "EDIT", "VERIFY"] },
  FEATURE: { execution: "MUTATING", workflow: ["PLAN", "BUILD", "TEST"] },
  REFACTOR: { execution: "MUTATING", workflow: ["PLAN", "CHANGE", "TEST"] },
}

export type TaskClassification = { type: TaskType; confidence: TaskIntent["confidence"]; reason: string }

/** Vocabulary only. Ordered so that a request demanding change never resolves to a read-only type. */
export function classifyTask(goal: string): TaskClassification {
  const tokens = tokenise(goal)
  if (!tokens.length) return { type: "FEATURE", confidence: "low", reason: "Empty goal; keeping the verified default" }
  if (forbidsMutation(goal, tokens))
    return { type: "ANALYSIS", confidence: "high", reason: "The request explicitly forbids changing files" }
  if (classifyIntent(goal) === "repair")
    return {
      type: "DEBUG",
      confidence: "high",
      reason: "Breakage vocabulary: reproduce the failure, then prove it is gone",
    }
  if (hits(tokens, refactorStems))
    return { type: "REFACTOR", confidence: "high", reason: "Restructuring vocabulary: behaviour must stay proven" }
  if (hits(tokens, featureStems))
    return { type: "FEATURE", confidence: "high", reason: "Construction vocabulary: new behaviour needs new evidence" }
  if (hits(tokens, auditStems))
    return { type: "AUDIT", confidence: "high", reason: "Assessment vocabulary: scan and report, do not repair" }
  if (hits(tokens, analysisStems) || tokens.some((token) => questionWords.has(token)))
    return { type: "ANALYSIS", confidence: "high", reason: "Explanatory vocabulary: the answer is the deliverable" }
  return {
    type: "FEATURE",
    confidence: "low",
    reason: "No decisive vocabulary; keeping the mutating, verified default",
  }
}

/**
 * The intent the loop actually runs with.
 *
 * An explicit contract mode from the caller wins: applying a read-only tool restriction inside a
 * coding contract would leave the agent unable to produce the evidence that contract requires.
 */
export function resolveIntent(goal: string, requestedMode?: Contract["mode"]): TaskIntent {
  const classified = classifyTask(goal)
  const profile = profiles[classified.type]
  const readOnly = profile.execution === "READ_ONLY" && requestedMode !== "coding"
  const overridden = profile.execution === "READ_ONLY" && !readOnly
  return {
    type: classified.type,
    execution: readOnly ? "READ_ONLY" : "MUTATING",
    mutationAllowed: !readOnly,
    verificationRequired: !readOnly,
    allowedTools: readOnly ? READ_ONLY_TOOLS : [],
    workflow: readOnly || profile.execution === "MUTATING" ? profile.workflow : ["PLAN", "CHANGE", "TEST"],
    confidence: classified.confidence,
    reason: overridden
      ? `${classified.reason}; the caller asked for a coding contract, so the read-only restriction is not applied`
      : classified.reason,
  }
}

/** Read-only work is proved by the answer it delivers, which is exactly the existing `answer` contract. */
export const contractMode = (intent: TaskIntent): Contract["mode"] =>
  intent.execution === "READ_ONLY" ? "answer" : "coding"

/**
 * The single gate used both when offering tools to the model and when executing one.
 * An absent intent means a session created before v0.2.3: behave exactly as v0.2.2 did.
 */
export function toolAllowed(intent: TaskIntent | undefined, tool: string, mode: Contract["mode"]): boolean {
  if (intent?.allowedTools.length) return intent.allowedTools.includes(tool)
  return mode !== "answer"
}
