import {
  AxiomError,
  type Conversation,
  type Message,
  type MessagePart,
  type Model,
} from '@axiom/shared';

export interface TokenEstimator {
  estimate(message: Message): number;
}
export interface ContextPolicy {
  fallbackContextWindow: number;
  outputReserve: number;
  safetyRatio: number;
}
export interface ContextInput {
  conversation: Conversation;
  messages: readonly Message[];
  model: Model;
}
export interface BuiltContext {
  messages: Message[];
  estimatedTokens: number;
  inputBudget: number;
  droppedMessageIds: string[];
}
export interface ContextBuilder {
  build(input: ContextInput): BuiltContext;
}
export class ContextBudgetError extends AxiomError {
  constructor() {
    super(
      'Последнее сообщение или системные инструкции превышают доступный контекст. Сократите текст или вложения либо выберите модель с большим контекстом.',
      400,
    );
    this.name = 'ContextBudgetError';
  }
}

/** Status is a persistence concern; this explicit policy decides what the model can see. */
export function includeInModelHistory(message: Message): boolean {
  if (message.status === 'complete') return true;
  return (
    message.role === 'assistant' &&
    message.status === 'aborted' &&
    message.parts.some((part) =>
      part.type === 'text'
        ? part.text.trim().length > 0
        : part.type === 'image' || part.type === 'file',
    )
  );
}

/** Conservative UTF-8 heuristic, not a guarantee against a provider tokenizer. */
export class ApproximateTokenEstimator implements TokenEstimator {
  private text(value: string): number {
    return Math.ceil(new TextEncoder().encode(value).length / 3);
  }
  private part(part: MessagePart): number {
    switch (part.type) {
      case 'text':
        return this.text(part.text);
      case 'file':
        return 16 + this.text(part.attachment.name) + this.text(part.text);
      case 'image':
        return 4096;
      case 'reasoning':
        return this.text(part.summary ?? '') + this.text(JSON.stringify(part.metadata));
      case 'tool-call':
        return 16 + this.text(part.name) + this.text(JSON.stringify(part.arguments) ?? '');
      case 'tool-result':
        return 16 + this.text(JSON.stringify(part.result) ?? '');
    }
  }
  estimate(message: Message): number {
    return 8 + message.parts.reduce((sum, part) => sum + this.part(part), 0);
  }
}

/** Keep a contiguous suffix of whole user-led turns. Never truncate parts or split tool exchanges. */
export class RecentTurnsContextBuilder implements ContextBuilder {
  private policy: ContextPolicy;
  constructor(
    private estimator: TokenEstimator = new ApproximateTokenEstimator(),
    policy: Partial<ContextPolicy> = {},
  ) {
    this.policy = { fallbackContextWindow: 8192, outputReserve: 2048, safetyRatio: 0.1, ...policy };
    if (
      !Number.isSafeInteger(this.policy.fallbackContextWindow) ||
      this.policy.fallbackContextWindow < 1 ||
      !Number.isSafeInteger(this.policy.outputReserve) ||
      this.policy.outputReserve < 0 ||
      !Number.isFinite(this.policy.safetyRatio) ||
      this.policy.safetyRatio < 0 ||
      this.policy.safetyRatio >= 1
    )
      throw new Error('Invalid context policy');
  }
  build({ conversation, messages, model }: ContextInput): BuiltContext {
    if (messages.some((message) => message.conversationId !== conversation.id))
      throw new AxiomError('История содержит сообщения другого диалога.');
    const window = model.contextWindow ?? this.policy.fallbackContextWindow;
    if (!Number.isSafeInteger(window) || window < 1)
      throw new AxiomError('Некорректный размер контекста модели.');
    const reserve = Math.min(this.policy.outputReserve, Math.floor(window / 4));
    const inputBudget = Math.max(0, Math.floor(window * (1 - this.policy.safetyRatio)) - reserve);
    const eligible = messages.filter(includeInModelHistory);
    const system = eligible.filter((message) => message.role === 'system');
    const turns: Message[][] = [];
    for (const message of eligible) {
      if (message.role === 'system') continue;
      if (message.role === 'user') turns.push([message]);
      else turns.at(-1)?.push(message); // Orphan assistant/tool messages have no initiating turn.
    }
    const cost = (group: Message[]) =>
      group.reduce((sum, m) => sum + this.estimator.estimate(m), 0);
    let estimatedTokens = cost(system);
    if (estimatedTokens > inputBudget) throw new ContextBudgetError();
    const kept: Message[][] = [];
    for (let index = turns.length - 1; index >= 0; index--) {
      const turn = turns[index]!;
      const tokens = cost(turn);
      if (estimatedTokens + tokens > inputBudget) {
        if (index === turns.length - 1) throw new ContextBudgetError();
        break;
      }
      kept.unshift(turn);
      estimatedTokens += tokens;
    }
    const result = [...system, ...kept.flat()];
    if (
      !model.capabilities.imageInput &&
      result.some((m) => m.parts.some((p) => p.type === 'image'))
    )
      throw new AxiomError(
        'В контексте есть изображения. Выберите модель с поддержкой изображений.',
      );
    const ids = new Set(result.map((m) => m.id));
    return {
      messages: result,
      estimatedTokens,
      inputBudget,
      droppedMessageIds: messages.filter((m) => !ids.has(m.id)).map((m) => m.id),
    };
  }
}
