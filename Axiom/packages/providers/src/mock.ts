import { setTimeout } from 'node:timers/promises';
import {
  textOf,
  type GenerationRequest,
  type Model,
  type ProviderConfiguration,
  type ProviderEvent,
} from '@axiom/shared';
import { StreamingProvider } from './base.js';
export const mockConfiguration: ProviderConfiguration = {
  id: 'axiom-mock',
  name: 'Axiom',
  kind: 'mock',
  baseUrl: '',
  locality: 'local',
  enabled: true,
  models: [
    {
      id: 'axiom-mock',
      displayName: 'Axiom Mock',
      provider: 'axiom-mock',
      locality: 'local',
      contextWindow: 32768,
      capabilities: {
        text: true,
        streaming: true,
        imageInput: false,
        tools: false,
        reasoning: false,
        web: false,
        imageGeneration: false,
        videoGeneration: false,
      },
    },
  ],
};
export class MockProvider extends StreamingProvider {
  readonly id = 'axiom-mock';
  async listModels(): Promise<Model[]> {
    return structuredClone(mockConfiguration.models);
  }
  async *streamChat(request: GenerationRequest): AsyncIterable<ProviderEvent> {
    const last = request.messages.findLast((m) => m.role === 'user');
    const input = last
      ? textOf(last)
          .replace(/[\r\n]+/g, ' ')
          .slice(0, 180)
      : '';
    const files = last?.parts.filter((p) => p.type === 'file') ?? [];
    const text = `Это **Axiom Mock** — локальная тестовая модель. Я не обращаюсь к внешним сервисам и не выполняю настоящий AI-анализ.\n\nВы написали: ${input || 'Сообщение с вложением'}\n\n${files.length ? `Получено текстовых файлов: **${files.length}**. Их содержимое сохранено вместе с сообщением.\n\n` : ''}В контексте сейчас **${request.messages.filter((m) => m.role === 'user').length}** сообщений пользователя. История этого диалога хранится в локальной базе.\n\n### Всё начинается с одной идеи\n\nAxiom соединяет интерфейс, общее ядро и независимые подключения к моделям. Можно сменить модель, продолжив этот же разговор.\n\n\`\`\`typescript\nconst axiom = {\n  version: '0.1',\n  provider: 'mock',\n  streaming: true,\n};\n\nconsole.log('Hello, Axiom', axiom);\n\`\`\`\n\nПопробуйте **скопировать код**, отредактировать своё сообщение или повторить ответ. Кнопка остановки сохраняет уже полученный текст.\n\nЭто намеренно неспешный тестовый ответ: он помогает проверить потоковую передачу, отмену и восстановление истории. Для настоящего AI-ответа подключите провайдер в настройках.`;
    for (const token of text.match(/\S+\s*/g) ?? []) {
      await setTimeout(35, undefined, { signal: request.signal });
      yield { type: 'delta', text: token };
    }
    yield { type: 'finish', result: { finishReason: 'stop' } };
  }
}
