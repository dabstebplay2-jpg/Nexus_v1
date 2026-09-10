import type { Store } from "../domain/ports"
import type { AgentSession, Input } from "../domain/types"
import { NexusError } from "../shared/errors"
import { redact } from "../shared/redact"

export function admit(
  store: Store,
  sessionId: string,
  text: string,
  delivery: Input["delivery"],
  id: string = crypto.randomUUID(),
) {
  if (!text.trim() || text.length > 20000) throw new NexusError("INPUT", "Prompt must contain 1–20000 characters")
  return store.transaction(() => {
    store.get(sessionId)
    const existing = store.record("queued_inputs", sessionId, id)
    if (existing) {
      if (existing.text !== redact(text) || existing.delivery !== delivery)
        throw new NexusError("INPUT_CONFLICT", "Conflicting prompt ID reuse")
      return existing
    }
    const input: Input = { id, sessionId, text: redact(text), delivery, promoted: false }
    store.put("queued_inputs", input)
    return input
  })
}
export function promote(store: Store, session: AgentSession, delivery: Input["delivery"]) {
  const pending = store
    .list("queued_inputs", session.id)
    .filter((input) => !input.promoted && input.delivery === delivery)
  const selected = delivery === "QUEUE" ? pending.slice(0, 1) : pending
  if (!selected.length) return false
  store.transaction(() => {
    selected.forEach((input) => {
      session.conversation.push({ role: "user", content: input.text })
      store.put("queued_inputs", { ...input, promoted: true })
    })
    session.goal = `${session.goal}\n${selected.map((input) => input.text).join("\n")}`
    session.contract = { ...session.contract, goal: session.goal, revision: session.contract.revision + 1 }
    // A new user requirement invalidates goal-specific evidence and old goal commands.
    session.contract.checks = session.contract.checks.filter((check) => check.kind !== "GOAL_ASSERTION")
    session.contract.criteria = [
      ...session.contract.criteria.filter((criterion) => criterion.kind !== "GOAL_ASSERTION"),
      { id: "goal", description: "Confirm the updated user requirement", kind: "GOAL_ASSERTION", required: true },
    ]
    session.plan = []
    session.decision = undefined
    store.save(session)
  })
  return true
}
