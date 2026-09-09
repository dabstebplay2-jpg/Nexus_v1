import type { AgentSession, Capability, Event, Message, ModelConfig, TableRecords, ToolCall } from "./types"

/** Atomic persistence boundary. Implementations must commit before returning from mutations. */
export interface Store {
  create(session: AgentSession): void
  get(id: string): AgentSession
  sessions(): AgentSession[]
  save(session: AgentSession): void
  put<K extends keyof TableRecords>(table: K, value: TableRecords[K]): void
  list<K extends keyof TableRecords>(table: K, sessionId: string): TableRecords[K][]
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
