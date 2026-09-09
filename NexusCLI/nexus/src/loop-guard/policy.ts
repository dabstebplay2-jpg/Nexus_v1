import type { Action, AgentSession, Evidence } from "../domain/types"

export type GuardDecision = {
  action: "DIAGNOSE" | "CHANGE_STRATEGY" | "COMPACT_CONTEXT" | "REPLAN" | "STOP"
  reason: string
}
export function loopGuard(session: AgentSession, actions: Action[], evidence: Evidence[]): GuardDecision | undefined {
  if (
    session.turns >= session.budgets.maxTurns ||
    session.toolCount >= session.budgets.maxTools ||
    session.activeMs >= session.budgets.maxDurationMs
  )
    return { action: "STOP", reason: "Execution budget exhausted" }
  const recent = actions.slice(-8)
  const signatures = recent.map((action) => `${action.tool}:${canonical(action.arguments)}:${action.afterHash ?? ""}`)
  const last = signatures.at(-1)
  if (recent.length >= 6 && new Set(signatures.slice(-6)).size === 1)
    return { action: "STOP", reason: "Repeated tool call continued after diagnosis" }
  if (recent.length >= 3 && signatures.slice(-3).every((signature) => signature === last))
    return { action: "DIAGNOSE", reason: "Same tool and arguments without new information" }
  if (recent.length >= 4 && signatures.at(-1) === signatures.at(-3) && signatures.at(-2) === signatures.at(-4))
    return { action: "CHANGE_STRATEGY", reason: "A/B action oscillation" }
  const errors = recent
    .slice(-3)
    .map((action) => action.error ?? (action.status === "FAILED" ? canonical(action.result) : undefined))
  if (errors.length === 3 && errors[0] && errors.every((error) => error === errors[0]))
    return { action: "DIAGNOSE", reason: "Identical error repeated" }
  const writes = recent.filter((action) => ["write", "edit"].includes(action.tool))
  if (writes.length >= 4 && new Set(writes.map((action) => action.target)).size === 1)
    return { action: "REPLAN", reason: "Repeated rewriting of one file" }
  const tests = recent.filter((action) => action.type === "verification")
  if (tests.length >= 3 && tests.every((action) => action.status === "FAILED"))
    return { action: "CHANGE_STRATEGY", reason: "Repeated verification failures without progress" }
  const novel = new Set(
    evidence
      .filter((item) => item.verdict === "pass")
      .map((item) => `${item.kind}:${canonical(item.actual)}:${item.fingerprint ?? ""}`),
  )
  if (session.turns >= 8 && novel.size < 2)
    return { action: "STOP", reason: "Too many turns without new passing evidence" }
  if (
    session.conversation.slice(session.epochStart).reduce((sum, item) => sum + item.content.length, 0) >
    session.model.capabilities.contextLength * 2
  )
    return { action: "COMPACT_CONTEXT", reason: "Context pressure" }
  return undefined
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`
  return JSON.stringify(value) ?? "null"
}
