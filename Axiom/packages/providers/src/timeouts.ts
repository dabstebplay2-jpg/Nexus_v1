import { AxiomError } from '@axiom/shared';

export type TimeoutKind = 'connection' | 'idle' | 'absolute';
export interface TimeoutOptions {
  connectionMs: number;
  idleMs: number;
  absoluteMs?: number;
}
export interface TimeoutClock {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}
const clock: TimeoutClock = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
export class ProviderTimeoutError extends AxiomError {
  constructor(public readonly kind: TimeoutKind) {
    super(
      {
        connection:
          'Провайдер не начал ответ вовремя. Проверьте подключение или увеличьте connection timeout.',
        idle: 'Провайдер слишком долго не передавал данные. Частичный ответ сохранён; увеличьте idle timeout для медленной модели.',
        absolute: 'Достигнут настроенный предел общей длительности запроса.',
      }[kind],
      504,
    );
    this.name = 'ProviderTimeoutError';
  }
}
/** Owns timers for a single request, disposed on every completion/error/cancellation path. */
export class RequestTimeouts {
  readonly signal: AbortSignal;
  private controller = new AbortController();
  private connection?: unknown;
  private idle?: unknown;
  private absolute?: unknown;
  constructor(
    private options: TimeoutOptions,
    signal?: AbortSignal,
    private scheduler: TimeoutClock = clock,
  ) {
    for (const value of Object.values(options))
      if (
        value !== undefined &&
        (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
      )
        throw new AxiomError('Некорректная настройка таймаута.');
    this.signal = signal
      ? AbortSignal.any([signal, this.controller.signal])
      : this.controller.signal;
    this.connection = this.arm('connection', options.connectionMs);
    if (options.absoluteMs !== undefined) this.absolute = this.arm('absolute', options.absoluteMs);
  }
  private arm(kind: TimeoutKind, ms: number): unknown {
    return this.scheduler.set(() => this.controller.abort(new ProviderTimeoutError(kind)), ms);
  }
  headersReceived(): void {
    this.scheduler.clear(this.connection);
    this.connection = undefined;
    this.activity();
  }
  activity(): void {
    this.scheduler.clear(this.idle);
    this.idle = this.arm('idle', this.options.idleMs);
  }
  dispose(): void {
    this.scheduler.clear(this.connection);
    this.scheduler.clear(this.idle);
    this.scheduler.clear(this.absolute);
  }
  rethrow(error: unknown): never {
    if (this.signal.aborted) throw this.signal.reason;
    throw error;
  }
}
