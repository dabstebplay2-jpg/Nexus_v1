import {
  AxiomError,
  friendlyError,
  textOf,
  type AIProvider,
  type ChatEvent,
  type ChatRepository,
  type Message,
  type MessagePart,
  type Model,
} from '@axiom/shared';
import { RecentTurnsContextBuilder, type ContextBuilder } from './context.js';
export interface ChatCommand {
  conversationId: string;
  model: Model;
  parts?: MessagePart[];
  editMessageId?: string;
  regenerate?: boolean;
}
export class ChatCore {
  private active = new Map<string, AbortController>();
  constructor(
    private repository: ChatRepository,
    private contextBuilder: ContextBuilder = new RecentTurnsContextBuilder(),
  ) {}
  isActive(id: string): boolean {
    return this.active.has(id);
  }
  stop(id: string): void {
    this.active.get(id)?.abort();
  }
  stopAll(): void {
    for (const controller of this.active.values()) controller.abort();
  }
  async *generate(
    command: ChatCommand,
    provider: AIProvider,
    signal?: AbortSignal,
  ): AsyncIterable<ChatEvent> {
    const { conversationId, model } = command;
    const conversation = this.repository.getConversation(conversationId);
    if (!conversation) throw new AxiomError('Диалог не найден.', 404);
    if (this.isActive(conversationId))
      throw new AxiomError('В этом диалоге уже идёт генерация.', 409);
    if (!model.capabilities.text || !model.capabilities.streaming)
      throw new AxiomError('Эта модель не поддерживает потоковый текстовый чат.');
    if (command.parts?.some((p) => p.type === 'image') && !model.capabilities.imageInput)
      throw new AxiomError('Выбранная модель не поддерживает изображения.');
    if (
      !command.regenerate &&
      (!command.parts?.length || command.parts.every((p) => p.type === 'text' && !p.text.trim()))
    )
      throw new AxiomError('Введите сообщение или добавьте файл.');
    // A request cancelled before Core starts must be side-effect free.
    // Normal cancellation after persistence still keeps the partial assistant
    // response as `aborted`, but a pre-aborted request never enters history.
    if (signal?.aborted) return;
    const history = this.repository.getMessages(conversationId);
    if (
      command.editMessageId &&
      !history.some((m) => m.id === command.editMessageId && m.role === 'user')
    )
      throw new AxiomError('Сообщение для редактирования не найдено.', 404);
    const lastUser = history.findLast((m) => m.role === 'user');
    if (command.regenerate && !lastUser)
      throw new AxiomError('Нет сообщения для повторной генерации.');
    const retainedHistory = command.editMessageId
      ? history.slice(
          0,
          history.findIndex((m) => m.id === command.editMessageId),
        )
      : command.regenerate && lastUser
        ? history.slice(0, history.indexOf(lastUser) + 1)
        : history;
    const user: Message | undefined = command.regenerate
      ? undefined
      : {
          id: crypto.randomUUID(),
          conversationId,
          role: 'user',
          parts: command.parts!,
          createdAt: new Date().toISOString(),
          status: 'complete',
        };
    // Build before any destructive edit/truncation. An oversized turn cannot erase history.
    const context = this.contextBuilder.build({
      conversation,
      model,
      messages: [...retainedHistory, ...(user ? [user] : [])],
    });
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    // A custom ContextBuilder may synchronously cancel the external signal.
    // Re-check before any repository mutation or active-generation state.
    if (controller.signal.aborted) {
      signal?.removeEventListener('abort', abort);
      return;
    }
    this.active.set(conversationId, controller);
    const assistant: Message = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      createdAt: new Date().toISOString(),
      status: 'generating',
      model: model.id,
      provider: model.provider,
    };
    let persisted = false;
    try {
      this.repository.transaction(() => {
        if (command.regenerate && lastUser) {
          const afterUser = history[history.indexOf(lastUser) + 1];
          if (afterUser) this.repository.truncateFrom(conversationId, afterUser.id);
        } else {
          if (command.editMessageId)
            this.repository.truncateFrom(conversationId, command.editMessageId);
          this.repository.saveMessage(user!);
          if (!history.length)
            conversation.title = (textOf(user!).trim() || 'Диалог с вложением')
              .replace(/\s+/g, ' ')
              .slice(0, 64);
        }
        conversation.updatedAt = new Date().toISOString();
        this.repository.saveConversation(conversation);
        this.repository.saveMessage(assistant);
      });
      persisted = true;
      if (user) yield { type: 'message', message: user };
      yield { type: 'message', message: assistant };
      let lastSaved = Date.now();
      for await (const event of provider.streamChat({
        model,
        messages: context.messages,
        signal: controller.signal,
      })) {
        controller.signal.throwIfAborted();
        if (event.type === 'delta') {
          const part = assistant.parts[0];
          if (part?.type === 'text') part.text += event.text;
          if (Date.now() - lastSaved > 300) {
            this.repository.saveMessage(assistant);
            lastSaved = Date.now();
          }
          yield { type: 'delta', messageId: assistant.id, text: event.text };
        }
      }
      assistant.status = controller.signal.aborted ? 'aborted' : 'complete';
    } catch (error) {
      if (!persisted) throw error;
      assistant.status = controller.signal.aborted ? 'aborted' : 'error';
      if (assistant.status === 'error') {
        assistant.error = friendlyError(error);
        yield { type: 'error', message: assistant.error };
      }
    } finally {
      if (assistant.status === 'generating') assistant.status = 'aborted';
      try {
        if (persisted) this.repository.saveMessage(assistant);
      } finally {
        this.active.delete(conversationId);
        signal?.removeEventListener('abort', abort);
      }
    }
    yield { type: 'done', message: assistant };
  }
}
