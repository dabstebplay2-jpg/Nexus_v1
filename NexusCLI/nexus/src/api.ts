import type {
  Action,
  AgentSession,
  Budgets,
  Check,
  Contract,
  Epoch,
  Event,
  Evidence,
  Input,
  ModelConfig,
  Turn,
  VerificationRun,
} from "./domain/types"
import type { TraceNode } from "./domain/trace"
export type { AgentSession, Check, Contract, Event, ModelConfig } from "./domain/types"
export type { ToolPhase, TraceEvent, TraceEventType, TraceNode, TraceStatus } from "./domain/trace"

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
    patches: {
      actionId?: string
      path: string
      patch: string
      before: string
      after: string
      timestamp: number
      beforeHash?: string
      afterHash?: string
      created: boolean
      snapshotIntegrity: "verified" | "unavailable"
    }[]
    processes: { actionId: string; tool: string; status: string; attribution: string }[]
  }
  rollback(id: string, actionId: string, note: string, signal?: AbortSignal): Promise<Action>
  inspect(id: string): {
    session: AgentSession
    actions: Action[]
    evidence: Evidence[]
    events: Event[]
    /**
     * The same events folded into the trace tree. Derived on read, never stored, so it cannot
     * disagree with the ledger and it is identical after a restart.
     */
    trace: TraceNode[]
    inputs: Input[]
    turns: Turn[]
    epochs: Epoch[]
    verification: VerificationRun[]
  }
  assertGoal(id: string, note: string): Promise<void>
  resolveAction(id: string, actionId: string, outcome: "VERIFIED" | "FAILED", note: string): void
  trustChecks(id: string, note: string): Promise<void>
  close(): void
}
