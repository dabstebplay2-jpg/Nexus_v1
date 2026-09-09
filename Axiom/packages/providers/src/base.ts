import type {
  AIProvider,
  GenerationRequest,
  GenerationResult,
  Model,
  ProviderEvent,
} from '@axiom/shared';
export abstract class StreamingProvider implements AIProvider {
  abstract readonly id: string;
  abstract listModels(signal?: AbortSignal): Promise<Model[]>;
  abstract streamChat(request: GenerationRequest): AsyncIterable<ProviderEvent>;
  async chat(request: GenerationRequest): Promise<GenerationResult> {
    let result: GenerationResult = { text: '', finishReason: 'stop' };
    for await (const event of this.streamChat(request)) {
      if (event.type === 'delta') result.text += event.text;
      else result = { ...result, ...event.result };
    }
    return result;
  }
}
