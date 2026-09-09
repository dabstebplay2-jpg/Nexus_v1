export const AXIOM_VERSION = '0.1.0-alpha.2';
export type Capability =
  | 'text'
  | 'imageInput'
  | 'tools'
  | 'reasoning'
  | 'web'
  | 'imageGeneration'
  | 'videoGeneration'
  | 'streaming'
  | (string & {});
export type Capabilities = Partial<Record<Capability, boolean>>;
export interface Model {
  id: string;
  displayName: string;
  provider: string;
  contextWindow?: number;
  capabilities: Capabilities;
  locality: 'local' | 'cloud';
}
export interface ProviderConfiguration {
  timeouts?: { connectionMs?: number; idleMs?: number; absoluteMs?: number };
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  locality: 'local' | 'cloud';
  models: Model[];
  enabled: boolean;
}
export interface Provider extends ProviderConfiguration {
  hasSecret: boolean;
}
export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}
export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; attachment: Attachment; dataUrl: string }
  | { type: 'file'; attachment: Attachment; text: string }
  | { type: 'tool-call'; callId: string; name: string; arguments: unknown }
  | { type: 'tool-result'; callId: string; result: unknown; isError?: boolean }
  | { type: 'reasoning'; summary?: string; metadata: Record<string, unknown> };
export type MessageStatus = 'complete' | 'generating' | 'aborted' | 'error';
export interface Message {
  updatedAt?: string;
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  parts: MessagePart[];
  createdAt: string;
  status: MessageStatus;
  model?: string;
  provider?: string;
  error?: string;
}
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
export interface GenerationRequest {
  model: Model;
  messages: Message[];
  signal: AbortSignal;
}
export interface GenerationResult {
  text: string;
  finishReason: 'stop' | 'length' | 'aborted';
  usage?: { inputTokens: number; outputTokens: number };
}
export type ProviderEvent =
  { type: 'delta'; text: string } | { type: 'finish'; result: Omit<GenerationResult, 'text'> };
export interface AIProvider {
  readonly id: string;
  listModels(signal?: AbortSignal): Promise<Model[]>;
  chat(request: GenerationRequest): Promise<GenerationResult>;
  streamChat(request: GenerationRequest): AsyncIterable<ProviderEvent>;
}
export interface ChatRepository {
  listConversations(): Conversation[];
  getConversation(id: string): Conversation | undefined;
  saveConversation(conversation: Conversation): void;
  deleteConversation(id: string): void;
  getMessages(conversationId: string): Message[];
  saveMessage(message: Message): void;
  truncateFrom(conversationId: string, messageId: string): void;
  transaction<T>(action: () => T): T;
}
export interface ConfigurationRepository {
  listProviders(): ProviderConfiguration[];
  saveProvider(provider: ProviderConfiguration): void;
  deleteProvider(id: string): void;
  getSettings(): AppSettings;
  saveSettings(settings: AppSettings): void;
}
export interface SecretStorage {
  get(id: string): string | undefined;
  set(id: string, secret: string): void;
  delete(id: string): void;
}
export interface AppSettings {
  favoriteModels: string[];
  selectedModel?: string;
}
export type ChatEvent =
  | { type: 'message'; message: Message }
  | { type: 'delta'; messageId: string; text: string }
  | { type: 'done'; message: Message }
  | { type: 'error'; message: string };
export const modelKey = (model: Pick<Model, 'id' | 'provider'>): string =>
  JSON.stringify([model.provider, model.id]);
export const textOf = (message: Pick<Message, 'parts'>): string =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
export class AxiomError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'AxiomError';
  }
}
export function friendlyError(error: unknown): string {
  return error instanceof AxiomError
    ? error.message
    : 'Не удалось выполнить запрос. Проверьте подключение и попробуйте ещё раз.';
}
