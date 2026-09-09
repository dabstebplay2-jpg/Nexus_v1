# NexusCLI — План миграции к Nexus 5.0

**Дата:** 2026-09-01  
**Целевая версия:** `5.0.0-beta` (codename: Ultimate AI OS)  
**Принцип:** Эволюция, не переписывание. Сохранить рабочие части, постепенно интегрировать.

---

## Фазы миграции

```
Phase 1: Core Foundation     ████████░░  (неделя 1)
Phase 2: Agent Runtime       ░░░░░░░░░░  (неделя 1-2)
Phase 3: Memory Engine       ░░░░░░░░░░  (неделя 2)
Phase 4: Tools & Security    ░░░░░░░░░░  (неделя 2-3)
Phase 5: Models & Plugins    ░░░░░░░░░░  (неделя 3)
Phase 6: Skills System       ░░░░░░░░░░  (неделя 3-4)
Phase 7: CLI 5.0             ░░░░░░░░░░  (неделя 4)
Phase 8: Testing & Docs      ░░░░░░░░░░  (неделя 4-5)
```

---

## Phase 1: Core Foundation

**Commit:** `Phase 1 Core Migration`

### 1.1 Единая версия

- [ ] Создать `nexus/version.py`:
  ```python
  VERSION = "5.0.0-beta"
  CODENAME = "Ultimate AI OS"
  ```
- [ ] Обновить `pyproject.toml` → `5.0.0-beta`
- [ ] Обновить `nexus.yaml` → `5.0.0-beta`
- [ ] Заменить hardcoded версии в CLI, dashboard, shell, api

### 1.2 NexusRuntime — единое ядро

Создать файлы в `nexus/core/`:

| Файл | Источник | Назначение |
|------|----------|------------|
| `kernel.py` | `kernel/kernel.py` + новое | Lifecycle, service registry, boot/shutdown |
| `runtime.py` | новое | `NexusRuntime` — главный класс |
| `event_bus.py` | `core/events.py` | Переименовать/реэкспорт |
| `registry.py` | новое | Unified ComponentRegistry |
| `state.py` | новое | SystemState, TaskState enums |
| `config.py` | новое | Загрузка nexus.yaml + env vars |

`NexusRuntime` API:
```python
class NexusRuntime:
    kernel: NexusKernel
    agents: AgentRegistry
    memory: MemoryManager
    tools: ToolRegistry
    models: ModelRouter
    plugins: PluginManager
    security: SecurityGate

    async def boot(self) -> None
    async def shutdown(self) -> None
    async def run_task(self, prompt: str) -> TaskResult
    def status(self) -> dict
```

### 1.3 Обратная совместимость

- [ ] `NexusCore` в `engine.py` → thin wrapper над `NexusRuntime`
- [ ] `from nexus.core.events import EventBus` → реэкспорт из `event_bus.py`
- [ ] Deprecation warnings для дубликатов (не удалять сразу)

### 1.4 Cleanup (без удаления)

- [ ] Пометить `@deprecated` на: `cli/cli/main.py`, `core/task_manager.py`, `kernel/event_bus.py`
- [ ] Добавить `__init__.py` exports в core

**Критерий готовности:** `pytest` проходит, `nexus status` показывает версию 5.0.0-beta через NexusRuntime.

---

## Phase 2: Agent Runtime

**Commit:** `Phase 2 Agent Runtime`

### 2.1 Унификация агентов

- [ ] Все агенты наследуют `BaseAgent`
- [ ] Единый `async execute(task: Task) -> AgentResult`
- [ ] `AgentProfile` dataclass: name, role, skills, tools, memory, permissions

### 2.2 Agent Society

Канонический список в `nexus/agents/society.py`:
```
Director, Architect, Researcher, Planner, Developer, Tester, Critic, Security, Repair
```

- [ ] Реализовать каждого агента с реальной (не stub) логикой
- [ ] `AgentRegistry` регистрирует всех 8 агентов
- [ ] `DirectorAgent` — оркестратор: plan → assign → verify

### 2.3 Task Pipeline

Создать/развить в `nexus/runtime/`:

| Файл | Назначение |
|------|------------|
| `task_engine.py` | Task lifecycle: created → analyzing → planning → executing → verifying → completed/failed |
| `planner.py` | Декомпозиция prompt в TaskGraph |
| `executor.py` | Выполнение шагов через агентов и tools |
| `verifier.py` | Проверка результатов |
| `repair_loop.py` | Retry с анализом ошибок (max 3 attempts) |

Pipeline:
```
User Request → TaskAnalyzer → Planner → TaskGraph → Director → Agents → Tools → Verifier → Critic → Repair → Result
```

### 2.4 Task State

```python
@dataclass
class TaskState:
    id: str
    prompt: str
    status: TaskStatus  # enum
    steps: list[TaskStep]
    history: list[ActionRecord]
    errors: list[TaskError]
    retries: int
    result: Any | None
```

### 2.5 Wiring

- [ ] `NexusRuntime.run_task()` → `TaskEngine.execute()`
- [ ] CLI `task` команда → `NexusRuntime.run_task()`
- [ ] Shell `task <text>` → то же

**Критерий готовности:** `nexus task "создай тестовый проект"` проходит полный pipeline и возвращает структурированный результат.

---

## Phase 3: Memory Engine

**Commit:** `Phase 3 Memory`

### 3.1 Консолидация

| Тип | Файл | Реализация |
|-----|------|------------|
| Short Term | `memory/storage.py` | In-memory context window (последние N сообщений) |
| Long Term | `memory/storage.py` | Persistent JSON/SQLite store |
| Project | `memory/project_memory.py` | Расширить существующий |
| Skill | `memory/storage.py` | Skill-specific knowledge |

### 3.2 Новые модули

- [ ] `memory/manager.py` — единый MemoryManager (facade)
- [ ] `memory/retrieval.py` — keyword + future vector search
- [ ] `memory/embeddings.py` — interface для embedding (stub → real later)
- [ ] `memory/knowledge_graph.py` — развить из stub

### 3.3 Интеграция

- [ ] Агенты получают контекст через `MemoryManager.get_context(agent, task)` перед execute
- [ ] Результаты сохраняются через `MemoryManager.remember(agent, task, result)`

**Критерий готовности:** `nexus memory` показывает реальное состояние stores, агенты используют контекст.

---

## Phase 4: Tools & Security

**Commit:** `Phase 4 Tools Security`

### 4.1 Tool System

- [ ] Единый `Tool` protocol в `tools/base.py`
- [ ] `ToolRegistry.get(name)` — исправить баг
- [ ] Реализовать tools:
  - `filesystem` — read, write, list, delete (с permissions)
  - `terminal` — shell commands (из shell.py)
  - `git` — status, diff, commit
  - `python` — run script, eval
- [ ] Объединить executor/caller → один `ToolExecutor`
- [ ] Удалить execution.py, calling.py, execution_graph.py

### 4.2 Security System

- [ ] `SecurityGate` — единый entry point
- [ ] Risk levels: SAFE, NORMAL, HIGH, CRITICAL
- [ ] Approval system с prompt: "Nexus wants: Delete file. Allow? [y/N]"
- [ ] Audit log для всех tool executions
- [ ] Интеграция: ToolExecutor → SecurityGate.check() → execute

**Критерий готовности:** опасные операции требуют approval, audit log записывает действия.

---

## Phase 5: Models & Plugins

**Commit:** `Phase 5 Models Plugins`

### 5.1 Model Router

- [ ] Единый `ModelRouter` в `models/router.py`
- [ ] Providers: OpenAI, Anthropic, Gemini, DeepSeek, Qwen, Ollama
- [ ] Критерии: complexity, cost, speed, capabilities
- [ ] Env-based config: `NEXUS_OPENAI_KEY`, `NEXUS_ANTHROPIC_KEY`, etc.
- [ ] Fallback chain

### 5.2 Plugin System

- [ ] `PluginManager` в `plugins/loader.py`
- [ ] `plugin.yaml` schema: name, version, capabilities, permissions, dependencies
- [ ] Types: tools, models, agents, skills
- [ ] Discovery из `~/.nexus/plugins/` и `./plugins/`
- [ ] ABI validation через `plugins/abi.py`

**Критерий готовности:** `nexus models` показывает доступные модели, `nexus plugins` — загруженные плагины.

---

## Phase 6: Skills System

**Commit:** `Phase 6 Skills`

### 6.1 Структура

```
skills/
├── python/skill.yaml
├── unity/skill.yaml
├── web/skill.yaml
├── design/skill.yaml
└── research/skill.yaml
```

### 6.2 Skill Schema

```yaml
name: python
description: Python development skills
rules:
  - Use type hints
  - Follow PEP 8
examples:
  - "Create a FastAPI endpoint"
tools: [filesystem, terminal, python]
```

### 6.3 Auto-selection

- [ ] `SkillMatcher` — выбор skills по task keywords
- [ ] Агенты получают matched skills в AgentProfile
- [ ] Skills как plugin type

---

## Phase 7: CLI 5.0

**Commit:** `Phase 7 CLI`

### 7.1 Новый интерфейс

```
╔══════════════════════╗
║ NEXUS 5.0            ║
║ AI OPERATING SYSTEM  ║
╚══════════════════════╝

Kernel:  ONLINE
Agents:  8 loaded
Memory:  ONLINE
Models:  3 available

nexus>
```

### 7.2 Команды (все через NexusRuntime)

| Команда | Действие |
|---------|----------|
| `status` | NexusRuntime.status() |
| `agents` | AgentRegistry.list() с profiles |
| `memory` | MemoryManager.stats() |
| `models` | ModelRouter.list() |
| `plugins` | PluginManager.list() |
| `skills` | SkillMatcher.list() |
| `projects` | ProjectMemory.list() |
| `task <text>` | NexusRuntime.run_task() |
| `debug` | Event bus history, task states |

### 7.3 Cleanup

- [ ] Удалить `cli/cli/main.py`
- [ ] Удалить `cli/ultimate.py` (или merge в debug)
- [ ] Обновить Dockerfile: `CMD ["nexus"]`

---

## Phase 8: Testing & Documentation

**Commit:** `Phase 8 Testing Docs`

### 8.1 Тесты (цель: 80% coverage)

| Файл | Что тестировать |
|------|-----------------|
| `test_kernel.py` | NexusKernel boot/shutdown, service registry |
| `test_runtime.py` | NexusRuntime lifecycle, run_task |
| `test_agents.py` | Все 8 агентов, AgentProfile, society |
| `test_memory.py` | Storage, retrieval, project memory |
| `test_tools.py` | Registry, executor, security integration |
| `test_cli.py` | Typer commands через CliRunner |
| `test_plugins.py` | Load, validate, register |
| `test_security.py` | Risk levels, approval flow |

### 8.2 Документация

- [ ] `docs/VISION.md`
- [ ] `docs/ARCHITECTURE.md`
- [ ] `docs/AGENTS.md`
- [ ] `docs/MEMORY.md`
- [ ] `docs/PLUGINS.md`
- [ ] `docs/TOOLS.md`
- [ ] `docs/API.md`
- [ ] `docs/DEVELOPER_GUIDE.md`

### 8.3 Финальная проверка

```bash
pytest --cov=nexus --cov-fail-under=80
nexus --help
nexus status
nexus agents
nexus memory
nexus task "создай тестовый проект"
```

---

## Порядок приоритетов

```
P0 (блокеры):     NexusRuntime, version.py, CLI wiring
P1 (ядро):        Agent pipeline, BaseAgent, Director
P2 (функции):     Memory, Tools, Security, Models
P3 (расширения):  Skills, Plugins, MCP
P4 (полировка):   Tests 80%, Docs, Docker
```

---

## Что НЕ делать

1. ❌ Не удалять модули без deprecation period
2. ❌ Не создавать новые файлы если можно расширить существующие
3. ❌ Не делать fake functions — каждая функция должна работать
4. ❌ Не трогать `.venv/`, `build/` — только `nexus/`
5. ❌ Не менять public API без compat wrapper

---

## Метрики успеха

| Метрика | Сейчас | Цель |
|---------|--------|------|
| Рабочих интеграций | 1 (NexusCore→Director) | 15+ |
| Реальных агентов | 1 | 8 |
| Реальных tools | 1 | 5 |
| Тестов с assertions | 2 | 50+ |
| Test coverage | ~5% | 80% |
| Версий в коде | 8+ | 1 |
| CLI команд через runtime | 0 | 9 |
