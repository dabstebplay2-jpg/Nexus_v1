# Phase 2 Report — Model System

**Дата:** 2026-09-01  
**Версия:** `5.0.0-beta`  
**Статус:** ✅ Завершена

---

## Цель

Реализовать полноценную Model System без автоматического выбора моделей. Пользователь всегда выбирает модель сам.

---

## Архитектура

```
nexus/models/
├── __init__.py          # публичные экспорты
├── types.py             # ModelEntry, ProviderType, ModelStatus
├── base.py              # ModelProvider ABC
├── http.py              # HTTP helpers (httpx)
├── config.py            # load/save models.yaml
├── registry.py          # ModelRegistry
├── manager.py           # ModelManager (главный класс)
├── factory.py           # create_provider()
├── model_router.py      # backward-compat alias → ModelManager
└── providers/
    ├── openai.py
    ├── anthropic.py
    ├── gemini.py
    ├── ollama.py
    ├── lmstudio.py
    └── openai_compatible.py
```

---

## 1. ModelProvider интерфейс

```python
class ModelProvider(ABC):
    async def check_connection(self) -> bool
    async def generate(self, prompt: str) -> str
    async def test(self, prompt: str = "Hello") -> dict
```

### Поддерживаемые провайдеры

| Provider | Тип | API |
|----------|-----|-----|
| `openai` | Cloud | OpenAI API (`/v1/chat/completions`) |
| `anthropic` | Cloud | Anthropic Messages API |
| `gemini` | Cloud | Google Gemini `generateContent` |
| `ollama` | Local | Ollama `/api/chat`, `/api/tags` |
| `lmstudio` | Local | LM Studio OpenAI-compatible |
| `openai_compatible` | Cloud/Local | Любой OpenAI-compatible endpoint |

---

## 2. Model Registry

`ModelRegistry` хранит `ModelEntry` по `id`:

- `register()`, `get()`, `list()`, `remove()`
- `set_status()` — CONNECTED / OFFLINE / ERROR

---

## 3. Model Manager

`ModelManager` — единая точка управления:

| Метод | Описание |
|-------|----------|
| `list()` | Все модели |
| `get_current()` | Текущая выбранная модель |
| `use(id)` | Выбор модели пользователем |
| `add(entry)` | Добавление модели |
| `remove(id)` | Удаление модели |
| `check_connection(id)` | Проверка подключения |
| `test(id, prompt)` | Тестовый запрос |
| `generate(prompt)` | Генерация через выбранную модель |
| `refresh_status()` | Обновить статусы всех моделей |

**Нет автоматического выбора модели по задаче.** Удалён `AdaptiveModelRouter.choose()` из runtime.

---

## 4. Конфигурация `models.yaml`

```yaml
current: gpt5

models:
  - id: gpt5
    name: GPT-5
    provider: openai
    model: gpt-5
    type: cloud
    capabilities: [coding, reasoning]
    api_key_env: OPENAI_API_KEY

  - id: qwen
    name: Qwen Coder
    provider: ollama
    model: qwen2.5-coder
    type: local
    capabilities: [coding]
    base_url: http://localhost:11434
```

Пути поиска: `models.yaml`, `.nexus/models.yaml`

---

## 5. CLI команды

### Typer

| Команда | Описание |
|---------|----------|
| `nexus models` | Таблица моделей (default) |
| `nexus models list` | Список моделей |
| `nexus models add` | Добавить модель |
| `nexus models remove <id>` | Удалить модель |
| `nexus models test [id]` | Тест подключения |
| `nexus models use <id>` | Выбрать активную модель |
| `nexus models current` | Показать текущую модель |

### Вывод `nexus models`

```
┏━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━┳━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━┓
┃ Name     ┃ Provider ┃ Type  ┃ Capabilities     ┃ Status    ┃
┡━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━╇━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━┩
│ → GPT-5  │ OpenAI   │ Cloud │ Coding Reasoning │ OFFLINE   │
│ Qwen ... │ Ollama   │ Local │ Coding           │ OFFLINE   │
└──────────┴──────────┴───────┴──────────────────┴───────────┘
```

### REPL (Cursor-style)

При запуске shell:
```
Current model: GPT-5
Commands: /model  /models  /use <id>  help  exit
```

| Команда | Действие |
|---------|----------|
| `/model` | Текущая модель |
| `/models` | Список моделей |
| `/use <id>` | Выбор модели |

---

## 6. Интеграция с Runtime

`NexusRuntime` использует `ModelManager` вместо `ModelRouter`:

- `run_task()` — использует `get_current()`, не выбирает модель автоматически
- `status()` — возвращает `current_model` и `models.summary()`

---

## Изменённые файлы

### Новые

- `nexus/models/types.py`
- `nexus/models/http.py`
- `nexus/models/config.py`
- `nexus/models/manager.py`
- `nexus/models/factory.py`
- `nexus/models/providers/__init__.py`
- `nexus/models/providers/anthropic.py`
- `nexus/models/providers/gemini.py`
- `nexus/models/providers/ollama.py`
- `nexus/models/providers/lmstudio.py`
- `nexus/models/providers/openai_compatible.py`
- `nexus/cli/models_cmd.py`
- `models.yaml`
- `tests/test_models_registry.py`
- `tests/test_models_config.py`
- `tests/test_models_providers.py`
- `tests/test_models_connection.py`

### Обновлённые

- `nexus/models/base.py` — ModelProvider ABC
- `nexus/models/registry.py` — полноценный registry
- `nexus/models/providers/openai.py` — OpenAIProvider
- `nexus/models/model_router.py` — alias ModelManager
- `nexus/models/__init__.py` — exports
- `nexus/core/runtime.py` — ModelManager, no auto-select
- `nexus/cli/main.py` — models subcommands
- `nexus/cli/shell.py` — /model, /models, /use
- `nexus/cli/display.py` — model table UI
- `tests/test_cli.py` — обновлены assertions

### Удалённые

- `nexus/models/providers.py` — конфликт с пакетом `providers/`

---

## Результаты тестов

```
pytest tests -q
64 passed in 5.35s
```

| Файл | Тестов | Покрытие |
|------|--------|----------|
| `test_models_registry.py` | 5 | register, list, remove, status |
| `test_models_config.py` | 4 | save/load, roundtrip, models.yaml |
| `test_models_providers.py` | 9 | factory, all providers, mocked HTTP |
| `test_models_connection.py` | 7 | manager use/add/remove/test |
| `test_cli.py` | +3 | models list/use/current |

---

## Принципы

1. **Пользователь выбирает модель** — нет `choose(task)` по ключевым словам
2. **Расширение, не переписывание** — `ModelRouter` = alias `ModelManager`
3. **Реальные провайдеры** — httpx, не заглушки
4. **Конфиг в YAML** — `models.yaml` как единый источник

---

## Следующие шаги (Phase 3+)

- Интеграция `ModelManager.generate()` в `run_task()` pipeline
- Streaming responses
- API keys vault / secure storage
- Model capabilities auto-detection
- Agent-specific model overrides
