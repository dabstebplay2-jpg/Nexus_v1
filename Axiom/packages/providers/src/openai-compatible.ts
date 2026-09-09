import {
  AxiomError,
  type GenerationRequest,
  type Model,
  type ProviderConfiguration,
  type ProviderEvent,
  type SecretStorage,
} from '@axiom/shared';
import { StreamingProvider } from './base.js';
import { readSSE } from './sse.js';
import { RequestTimeouts } from './timeouts.js';
export class OpenAICompatibleProvider extends StreamingProvider {
  readonly id: string;
  constructor(
    private configuration: ProviderConfiguration,
    private secrets: SecretStorage,
  ) {
    super();
    this.id = configuration.id;
  }
  private async request(
    path: string,
    scope: RequestTimeouts,
    init: RequestInit = {},
  ): Promise<Response> {
    const key = this.secrets.get(this.id);
    try {
      const response = await fetch(`${this.configuration.baseUrl.replace(/\/+$/, '')}/${path}`, {
        ...init,
        redirect: 'error',
        signal: scope.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
      });
      scope.headersReceived();
      if (!response.ok) {
        await response.body?.cancel();
        const messages: Record<number, string> = {
          401: 'API-ключ не принят. Проверьте ключ в настройках.',
          403: 'Провайдер запретил доступ к этой модели.',
          404: 'Endpoint или модель не найдены. Проверьте Base URL и ID модели.',
          429: 'Лимит провайдера исчерпан. Повторите запрос позже.',
        };
        throw new AxiomError(
          messages[response.status] ??
            `Провайдер вернул ошибку HTTP ${response.status}. Проверьте настройки подключения.`,
        );
      }
      return response;
    } catch (error) {
      if (scope.signal.aborted) scope.rethrow(error);
      if (error instanceof AxiomError) throw error;
      throw new AxiomError(
        'Провайдер недоступен или время ожидания истекло. Проверьте адрес и запущен ли сервер.',
      );
    }
  }
  async listModels(signal?: AbortSignal): Promise<Model[]> {
    const scope = new RequestTimeouts(
      { connectionMs: 12_000, idleMs: 12_000, absoluteMs: 30_000, ...this.configuration.timeouts },
      signal,
    );
    try {
      const response = await this.request('models', scope);
      if (!response.body) throw new AxiomError('Провайдер вернул пустой список моделей.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let json = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (value?.length) scope.activity();
          json += decoder.decode(value, { stream: !done });
          if (json.length > 2_000_000)
            throw new AxiomError('Список моделей слишком велик. Укажите модели вручную.');
          if (done) break;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      let body: unknown;
      try {
        body = JSON.parse(json);
      } catch {
        throw new AxiomError('Endpoint /models вернул повреждённый JSON.');
      }
      if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data))
        throw new AxiomError(
          'Endpoint /models вернул неподдерживаемый формат. Укажите ID моделей вручную.',
        );
      return body.data
        .filter(
          (entry): entry is { id: string } =>
            !!entry && typeof entry === 'object' && typeof entry.id === 'string',
        )
        .slice(0, 500)
        .map(
          (entry) =>
            this.configuration.models.find((m) => m.id === entry.id) ?? {
              id: entry.id,
              displayName: entry.id,
              provider: this.id,
              locality: this.configuration.locality,
              capabilities: { text: true, streaming: true },
            },
        );
    } catch (error) {
      return scope.rethrow(error);
    } finally {
      scope.dispose();
    }
  }
  async *streamChat(request: GenerationRequest): AsyncIterable<ProviderEvent> {
    const messages = request.messages.map((message) => {
      const content = message.parts.map((part) => {
        switch (part.type) {
          case 'text':
            return { type: 'text', text: part.text };
          case 'file':
            return { type: 'text', text: `\nFile: ${part.attachment.name}\n${part.text}` };
          case 'image':
            return { type: 'image_url', image_url: { url: part.dataUrl } };
          default:
            throw new AxiomError(
              'Этот адаптер пока поддерживает только текст, текстовые файлы и изображения.',
            );
        }
      });
      return {
        role: message.role,
        content: content.every((p) => p.type === 'text')
          ? content.map((p) => p.text).join('\n')
          : content,
      };
    });
    const scope = new RequestTimeouts(
      { connectionMs: 30_000, idleMs: 180_000, ...this.configuration.timeouts },
      request.signal,
    );
    try {
      const response = await this.request('chat/completions', scope, {
        method: 'POST',
        signal: request.signal,
        body: JSON.stringify({ model: request.model.id, messages, stream: true }),
      });
      if (!response.body) throw new AxiomError('Провайдер вернул пустой ответ.');
      let finished = false;
      try {
        for await (const data of readSSE(response.body, () => scope.activity())) {
          if (data === '[DONE]') {
            finished = true;
            break;
          }
          let chunk: {
            error?: unknown;
            choices?: { delta?: { content?: unknown }; finish_reason?: string | null }[];
          };
          try {
            chunk = JSON.parse(data) as typeof chunk;
          } catch {
            throw new AxiomError('Провайдер прислал повреждённый поток ответа.');
          }
          if (chunk.error)
            throw new AxiomError(
              'Провайдер прервал генерацию с ошибкой. Проверьте подключение и лимиты.',
            );
          const choice = chunk.choices?.[0];
          if (typeof choice?.delta?.content === 'string')
            yield { type: 'delta', text: choice.delta.content };
          if (choice?.finish_reason) {
            finished = true;
            yield {
              type: 'finish',
              result: { finishReason: choice.finish_reason === 'length' ? 'length' : 'stop' },
            };
          }
        }
      } catch (error) {
        if (scope.signal.aborted) scope.rethrow(error);
        if (error instanceof AxiomError) throw error;
        throw new AxiomError('Поток ответа прерван. Уже полученный текст сохранён.');
      }
      if (!finished)
        throw new AxiomError(
          'Соединение закрыто до завершения ответа. Попробуйте повторить генерацию.',
        );
    } finally {
      scope.dispose();
    }
  }
}
