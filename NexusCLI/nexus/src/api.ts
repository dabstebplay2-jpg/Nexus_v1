import type { AgentSession, Budgets, Check, Contract, Event, Input, ModelConfig } from "./domain/types"
export type { AgentSession, Check, Contract, Event, ModelConfig } from "./domain/types"

/** UI boundary: clients submit commands and render events; they never mutate the runner. */
export interface NexusAPI {
  create(input: {
    workspace: string
    goal: string
    model: ModelConfig
    mode?: Contract["mode"]
    budgets?: Partial<Budgets>
    goalCheck?: Check
  }): Promise<AgentSession>
  run(id: string, signal?: AbortSignal): Promise<AgentSession>
  prompt(id: string, text: string, delivery?: Input["delivery"], messageId?: string): Input
  sessions(): AgentSession[]
  diff(id: string): {
    patches: { actionId?: string; patch: string }[]
    processes: { actionId: string; tool: string; status: string; attribution: string }[]
  }
  inspect(id: string): {
    session: AgentSession
    actions: unknown[]
    evidence: unknown[]
    events: Event[]
    inputs: Input[]
    turns: unknown[]
    epochs: unknown[]
    verification: unknown[]
  }
  assertGoal(id: string, note: string): Promise<void>
  resolveAction(id: string, actionId: string, outcome: "VERIFIED" | "FAILED", note: string): void
  trustChecks(id: string, note: string): Promise<void>
  close(): void
}
