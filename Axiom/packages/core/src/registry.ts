import {
  AxiomError,
  type AIProvider,
  type ProviderConfiguration,
  type SecretStorage,
} from '@axiom/shared';
export type ProviderFactory = (
  configuration: ProviderConfiguration,
  secrets: SecretStorage,
) => AIProvider;
export class ProviderRegistry {
  private factories = new Map<string, ProviderFactory>();
  register(kind: string, factory: ProviderFactory): void {
    if (this.factories.has(kind)) throw new Error(`Provider kind already registered: ${kind}`);
    this.factories.set(kind, factory);
  }
  create(configuration: ProviderConfiguration, secrets: SecretStorage): AIProvider {
    const factory = this.factories.get(configuration.kind);
    if (!factory) throw new AxiomError('Для этого провайдера ещё не установлен адаптер.');
    if (!configuration.enabled)
      throw new AxiomError('Провайдер отключён. Подключите его в настройках.');
    return factory(configuration, secrets);
  }
}
