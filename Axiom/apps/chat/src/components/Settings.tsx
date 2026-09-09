import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Cloud,
  KeyRound,
  LoaderCircle,
  Monitor,
  Plus,
  Radio,
  Trash2,
  X,
} from 'lucide-react';
import type { Provider } from '@axiom/shared';
import { api } from '../api';
import { useDialogFocus } from '../hooks/useDialogFocus';
const presets = [
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    locality: 'cloud' as const,
    available: true,
    note: 'OpenAI-compatible API',
  },
  {
    name: 'Anthropic',
    baseUrl: '',
    locality: 'cloud' as const,
    available: false,
    note: 'Нативный адаптер запланирован',
  },
  {
    name: 'Google Gemini',
    baseUrl: '',
    locality: 'cloud' as const,
    available: false,
    note: 'Нативный адаптер запланирован',
  },
  {
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    locality: 'local' as const,
    available: true,
    note: 'Локальный OpenAI-compatible API',
  },
  {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    locality: 'local' as const,
    available: true,
    note: 'Через OpenAI-compatible API',
  },
];
type Form = {
  id?: string;
  name: string;
  baseUrl: string;
  locality: 'local' | 'cloud';
  apiKey: string;
  modelIds: string;
  hasSecret?: boolean;
  imageInput: boolean;
  clearSecret: boolean;
};
export function Settings({
  providers,
  onRefresh,
  onClose,
}: {
  providers: Provider[];
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Form>();
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checks, setChecks] = useState<Record<string, 'connected' | 'disconnected'>>({});
  const formRef = useRef<HTMLFormElement>(null);
  useDialogFocus(!!form, formRef);
  const startForm = (initial: Pick<Form, 'name' | 'baseUrl' | 'locality'>, provider?: Provider) => {
    setError('');
    setNotice('');
    setForm({
      ...initial,
      id: provider?.id,
      hasSecret: provider?.hasSecret,
      modelIds: provider?.models.map((m) => m.id).join('\n') ?? '',
      apiKey: '',
      imageInput:
        !!provider?.models.length &&
        provider.models.every((m) => m.capabilities.imageInput === true),
      clearSecret: false,
    });
  };
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const ids = [
        ...new Set(
          form.modelIds
            .split(/[\n,]/)
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ];
      const old = providers.find((p) => p.id === form.id);
      const provider = await api<Provider>(
        form.id ? `/providers/${form.id}` : '/providers',
        form.id ? 'PUT' : 'POST',
        {
          ...form,
          models: ids.map((id) => ({
            id,
            displayName: old?.models.find((m) => m.id === id)?.displayName ?? id,
            contextWindow: old?.models.find((m) => m.id === id)?.contextWindow,
            capabilities: {
              ...old?.models.find((m) => m.id === id)?.capabilities,
              text: true,
              streaming: true,
              imageInput: form.imageInput,
            },
          })),
        },
      );
      setForm(undefined);
      await onRefresh();
      setNotice('Подключение сохранено. Проверяем доступность…');
      await test(provider.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить подключение.');
    } finally {
      setBusy(false);
    }
  };
  const test = async (id: string) => {
    setTesting(id);
    setError('');
    setNotice('');
    try {
      const result = await api<{ message: string }>(`/providers/${id}/test`, 'POST');
      setChecks((previous) => ({ ...previous, [id]: 'connected' }));
      setNotice(result.message);
      await onRefresh();
    } catch (cause) {
      setChecks((previous) => ({ ...previous, [id]: 'disconnected' }));
      setError(
        `${cause instanceof Error ? cause.message : 'Нет связи с провайдером.'} Если /models недоступен, задайте ID модели вручную. Настройки сохранены.`,
      );
    } finally {
      setTesting(undefined);
    }
  };
  const remove = async (provider: Provider) => {
    if (!window.confirm(`Удалить подключение «${provider.name}»? История чатов сохранится.`))
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/providers/${provider.id}`, 'DELETE');
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить подключение.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-page">
      <header className="page-header">
        <button className="back-button" onClick={onClose}>
          <ArrowLeft size={16} />
          Вернуться в чат
        </button>
        <span className="version">AXIOM / НАСТРОЙКИ</span>
      </header>
      <div className="settings-content">
        <div className="eyebrow">ВАШ AI, ВАШИ ПРАВИЛА</div>
        <h1>Подключения</h1>
        <p className="settings-intro">
          Облачные возможности. Локальная независимость.
          <br />
          Выберите, какие модели будут работать с вами.
        </p>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice success" role="status">
            <Check size={16} />
            {notice}
          </div>
        )}
        <h2>
          Ваше пространство <span>{providers.length}</span>
        </h2>
        <div className="provider-grid">
          {providers.map((provider) => (
            <div className="provider-card" key={provider.id}>
              <div className="provider-card-top">
                <div className="provider-symbol">
                  {provider.locality === 'local' ? <Monitor size={22} /> : <Cloud size={22} />}
                </div>
                <span
                  className={`status-pill ${provider.kind === 'mock' || checks[provider.id] === 'connected' ? 'online' : checks[provider.id] === 'disconnected' ? 'offline' : ''}`}
                >
                  <span />
                  {provider.kind === 'mock'
                    ? 'Готов к работе'
                    : testing === provider.id
                      ? 'Проверяем…'
                      : checks[provider.id] === 'connected'
                        ? 'Проверено'
                        : checks[provider.id] === 'disconnected'
                          ? 'Нет связи с /models'
                          : 'Настроено'}
                </span>
              </div>
              <h3>{provider.name}</h3>
              <p>
                {provider.kind === 'mock'
                  ? 'Тестовая модель. Без ключей и внешних запросов.'
                  : provider.baseUrl}
              </p>
              <div className="provider-card-bottom">
                <span>
                  {provider.models.length} моделей ·{' '}
                  {provider.locality === 'local' ? 'Локально' : 'Облако'}
                </span>
                {provider.kind !== 'mock' && (
                  <div>
                    <button
                      disabled={busy || !!testing}
                      className="text-button"
                      onClick={() => startForm(provider, provider)}
                    >
                      Изменить
                    </button>
                    <button
                      className="icon-button"
                      disabled={busy || !!testing}
                      aria-label={`Удалить ${provider.name}`}
                      onClick={() => {
                        void remove(provider);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              {provider.kind !== 'mock' && (
                <button
                  className="test-button"
                  disabled={busy || !!testing}
                  onClick={() => {
                    void test(provider.id);
                  }}
                >
                  {testing === provider.id ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <Radio size={14} />
                  )}
                  Проверить подключение
                </button>
              )}
            </div>
          ))}
          <button
            className="provider-card add-provider"
            onClick={() => startForm({ name: '', baseUrl: '', locality: 'cloud' })}
          >
            <Plus size={24} />
            <strong>Своё подключение</strong>
            <span>Любой OpenAI-compatible API</span>
          </button>
        </div>
        <h2>Добавить провайдера</h2>
        <div className="provider-presets">
          {presets.map((preset) => (
            <button
              key={preset.name}
              disabled={!preset.available}
              onClick={() => startForm(preset)}
            >
              <span className="preset-symbol">{preset.name.charAt(0)}</span>
              <span>
                <strong>{preset.name}</strong>
                <small>{preset.note}</small>
              </span>
              <span className="preset-status">
                {providers.some((p) => p.name === preset.name) ? 'Добавлено' : 'Не подключено'}
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
        <div className="secret-note">
          <KeyRound size={18} />
          <p>
            Ключи остаются на этом компьютере и не возвращаются в браузер. В v0.1 используется
            зашифрованное локальное хранилище; защита зависит от доступа к вашему профилю и папке
            данных.
          </p>
        </div>
      </div>
      {form && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setForm(undefined);
          }}
        >
          <form
            ref={formRef}
            className="provider-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !busy) setForm(undefined);
            }}
          >
            <div className="popover-heading">
              <h2 id="connection-title">
                {form.id ? 'Настройки подключения' : 'Новое подключение'}
              </h2>
              <button
                type="button"
                disabled={busy}
                className="icon-button"
                aria-label="Закрыть настройки подключения"
                onClick={() => setForm(undefined)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="muted">Используется протокол OpenAI Chat Completions.</p>
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            <label>
              Название
              <input
                autoFocus
                required
                maxLength={80}
                placeholder="Мой AI сервер"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Base URL
              <input
                required
                type="url"
                placeholder="http://localhost:1234/v1"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              />
              <small>Адрес API, обычно заканчивается на /v1.</small>
            </label>
            <label>
              API Key <span className="muted">— необязательно для локальных серверов</span>
              <input
                type="password"
                autoComplete="new-password"
                placeholder={
                  form.hasSecret ? 'Сохранён. Оставьте пустым, чтобы сохранить.' : 'Введите ключ'
                }
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
            </label>
            {form.hasSecret && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.clearSecret}
                  onChange={(e) => setForm({ ...form, clearSecret: e.target.checked })}
                />
                Удалить сохранённый ключ
              </label>
            )}
            <label>
              Модели <span className="muted">— ID, по одному на строку</span>
              <textarea
                rows={3}
                placeholder="Оставьте пустым для обнаружения через /models"
                value={form.modelIds}
                onChange={(e) => setForm({ ...form, modelIds: e.target.value })}
              />
            </label>
            <div className="form-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.locality === 'local'}
                  onChange={(e) =>
                    setForm({ ...form, locality: e.target.checked ? 'local' : 'cloud' })
                  }
                />
                Локальное подключение
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.imageInput}
                  onChange={(e) => setForm({ ...form, imageInput: e.target.checked })}
                />
                Модели принимают изображения
              </label>
            </div>
            <p className="field-note">
              Включайте изображения только для совместимых моделей. Остальные неизвестные
              возможности не предполагаются автоматически.
            </p>
            <button className="primary-button" disabled={busy || !!testing} type="submit">
              {busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}
              Сохранить и проверить
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
