import type { AgentSession, Capability, Event, Message, ModelConfig, TableRecords, ToolCall } from "./types"

export type Range = { offset?: number; limit: number }
/** Narrows a tail read by an exact JSON property, e.g. { path: "$.kind", values: ["FILE_CHANGE"] }. */
export type TailFilter = { path: string; values: string[] }
/** One append-only ledger envelope. `seq` is stable and monotonic, so it is a durable cursor. */
export type LedgerEntry = { seq: number; kind: string; ref: string; ts: number }
/**
 * Atomic persistence boundary. Implementations must commit before returning from mutations.
 *
 * `list` reads a whole projection and stays for callers that genuinely evaluate all of it, such as
 * CompletionPolicy. Everything else should use the bounded reads: `record` for one row, `count`,
 * `page`, `tail`, and `ledger` for a resumable stream.
 */
export interface Store {
  create(session: AgentSession): void
  get(id: string): AgentSession
  /** Session without its transcript. O(1) regardless of session length; pair with `messages`. */
  header(id: string): AgentSession
  sessions(): AgentSession[]
  headers(): AgentSession[]
  save(session: AgentSession): void
  put<K extends keyof TableRecords>(table: K, value: TableRecords[K]): void
  list<K extends keyof TableRecords>(table: K, sessionId: string): TableRecords[K][]
  record<K extends keyof TableRecords>(table: K, sessionId: string, id: string): TableRecords[K] | undefined
  count<K extends keyof TableRecords>(table: K, sessionId: string): number
  page<K extends keyof TableRecords>(table: K, sessionId: string, range: Range): TableRecords[K][]
  tail<K extends keyof TableRecords>(table: K, sessionId: string, limit: number, filter?: TailFilter): TableRecords[K][]
  messageCount(sessionId: string): number
  messages(sessionId: string, range?: Range): Message[]
  ledger(sessionId: string, cursor: { afterSeq?: number; limit: number }): LedgerEntry[]
  transaction<T>(operation: () => T): T
  acquire(sessionId: string, workspace: string): () => void
  close(): void
}
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> }
export type ModelRequest = {
  model: ModelConfig
  messages: Message[]
  tools: ToolSpec[]
  maxTokens: number
  signal: AbortSignal
}
export type ModelEvent =
  | { type: "text"; text: string }
  | { type: "tool"; call: ToolCall }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "finish" }
/** Exactly one stream per provider turn; adapters never execute tools. */
export interface Provider {
  stream(request: ModelRequest): AsyncIterable<ModelEvent>
}
export type PermissionRequest = {
  sessionId: string
  actionId: string
  tool: string
  arguments: unknown
  capabilities: Capability[]
  reason: string
}
export type PermissionReply = (request: PermissionRequest, signal: AbortSignal) => Promise<boolean>
export type EventSink = (event: Event) => void
/** Provider-independent token accounting. Implementations may wrap a real tokenizer. */
export interface TokenCounter {
  count(text: string): number
}
