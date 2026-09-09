# NexusCLI — Архитектурный анализ

**Дата:** 2026-09-01  
**Цель:** Определить фундамент, дублирования, конфликты и целевую архитектуру Nexus 5.0

---

## 1. Текущая vs целевая архитектура

### 1.1 Текущая (фрагментированная)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  CLI (v4)   │     │ CLI (v3.1)  │     │  ultimate   │
│  main.py    │     │ cli/main.py │     │  .py        │
└──────┬──────┘     └─────────────┘     └─────────────┘
       │ print stubs (не вызывает core)
       ▼
┌─────────────┐     ┌─────────────┐
│  shell.py   │     │ dashboard   │
└─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐
│ NexusCore   │     │ NexusKernel │  ← не связаны
│ (core/)     │     │ (kernel/)   │
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│ Director    │  ← единственный агент
└─────────────┘

[runtime/] [workflow/] [memory/] [tools/] [models/] [security/]
     ↑ все изолированы, 0 wiring
```

### 1.2 Целевая (Nexus 5.0)

```
                    ┌──────────────────┐
                    │   NexusRuntime   │
                    │  (единое ядро)   │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │         │          │          │         │
        ▼         ▼          ▼          ▼         ▼
    ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
    │Agents │ │Memory │ │ Tools │ │Models │ │Plugins│
    └───────┘ └───────┘ └───────┘ └───────┘ └───────┘
        │                                    │
        └──────────────┬─────────────────────┘
                       ▼
                 ┌───────────┐
                 │ Security  │
                 └───────────┘
                       │
                       ▼
                 ┌───────────┐
                 │    CLI    │
                 └───────────┘
```

**Принцип:** `NexusRuntime` — единственная точка входа для lifecycle, событий, состояния, регистрации компонентов, управления агентами и permissions.

---

## 2. Фундаментальные модули (сохранить и развивать)

| Модуль | Файл | Почему фундамент |
|--------|------|------------------|
| Core engine | `core/engine.py` | Единственная живая интеграция агентов |
| Event bus | `core/events.py` | Async шина с timestamp — лучше kernel/event_bus |
| Task model | `core/tasks.py` | Dataclass Task + TaskManager — канонический API |
| Agent loop | `core/loop.py` | Готовый async pipeline |
| Workflow | `core/workflow.py` | Multi-agent execute с историей |
| Agent registry | `agents/registry.py` | Реестр агентов |
| Director | `agents/director.py` | Главный оркестратор |
| Base agent | `agents/base.py` | ABC для унификации |
| Shell tool | `tools/shell.py` | Единственный реальный tool |
| Model router | `models/router.py` | База для adaptive routing |
| OpenAI provider | `models/providers/openai.py` | Реальный HTTP |
| CLI shell | `cli/shell.py` | UX-оболочка |
| CLI main | `cli/main.py` | Entry point |
| UI | `ui/` | Dashboard, animations |
| Security audit | `security/audit.py` | In-memory audit trail |
| Permissions | `security/permissions.py` | Базовая эвристика |

---

## 3. Дублирования (критические)

### 3.1 Два CLI entry point

| Файл | Версия | Рекомендация |
|------|--------|--------------|
| `cli/main.py` | 4.0 Genesis | **Оставить** (активный entry point) |
| `cli/cli/main.py` | 3.1 Genesis | Deprecate → удалить в Phase 5 |

### 3.2 Event Bus

| Файл | API | Рекомендация |
|------|-----|--------------|
| `core/events.py` | async emit(name, payload) + timestamp | **Канонический** → `core/event_bus.py` |
| `kernel/event_bus.py` | sync emit(event) | Удалить, перенести логику в core |
| `runtime/events.py` | EventEngine stub | Удалить |

### 3.3 Task Management

| Файл | API | Рекомендация |
|------|-----|--------------|
| `core/tasks.py` | Task dataclass + TaskManager | **Канонический** |
| `core/task_manager.py` | dict-based create | Удалить |
| `runtime/task_store.py` | stub save/get | Развить в storage layer |

### 3.4 Agent Management

| Файл | Рекомендация |
|------|--------------|
| `agents/registry.py` | **Канонический** → расширить |
| `agents/manager.py` | Удалить |
| `core/agent_manager.py` | Удалить (hardcoded list) |
| `agents/factory.py` + `agent_factory.py` | Объединить в один AgentFactory |

### 3.5 Agent Bus

| Файл | API | Рекомендация |
|------|-----|--------------|
| `core/bus.py` | async send() | **Канонический** |
| `agents/bus.py` | publish() | Удалить |

### 3.6 Workflow Engine

| Файл | Рекомендация |
|------|--------------|
| `core/workflow.py` | **Канонический** (async multi-agent) |
| `workflow/engine.py` | Удалить stub |

### 3.7 Autonomous Runtime

| Файл | Рекомендация |
|------|--------------|
| `core/autonomous.py` | Интегрировать в NexusRuntime |
| `platform/autonomous_runtime.py` | Удалить |

### 3.8 Sandbox

| Файл | Рекомендация |
|------|--------------|
| `security/sandbox.py` | Развить (реальная изоляция) |
| `runtime/sandbox.py` | Удалить (идентичен) |
| `sandbox/manager.py` | Объединить с security |

### 3.9 Model Routing

| Файл | Рекомендация |
|------|--------------|
| `models/router.py` | **База** → развить в ModelRouter |
| `models/task_router.py` | Объединить (добавить русские keywords) |
| `models/ultimate_router.py` | Объединить |

### 3.10 Provider Registry

| Файл | Рекомендация |
|------|--------------|
| `models/registry.py` | **Канонический** ModelRegistry |
| `models/providers.py` | Удалить |
| `models/provider_registry.py` | Удалить (конфликт имён) |

### 3.11 Memory Stores

| Файл | Рекомендация |
|------|--------------|
| `memory/store.py` | **База** ShortTermMemory |
| `memory/project_memory.py` | **База** ProjectMemory |
| `memory/manager.py`, `context.py`, `intelligence.py`, `semantic.py` | Удалить (дубли) |

### 3.12 Tool Execution

| Файл | Рекомендация |
|------|--------------|
| `tools/executor.py` | **Канонический** (добавить get() в registry) |
| `tools/caller.py` | Удалить (дубликат) |
| `tools/execution.py`, `calling.py`, `execution_graph.py` | Объединить в executor |

### 3.13 Security Approval

| Файл | Рекомендация |
|------|--------------|
| `security/gate.py` + `approval.py` | Объединить в ApprovalSystem |
| `security/policy_engine.py` + `permissions.py` | Объединить в PolicyEngine |

### 3.14 Plugins

| Файл | Рекомендация |
|------|--------------|
| `plugins/loader.py` | **База** PluginManager |
| `plugins/sdk.py`, `marketplace.py` | Интегрировать в loader |
| `ecosystem/marketplace.py` | Удалить дубликат |

### 3.15 Agent Society Lists

| Источник | Агенты |
|----------|--------|
| `agent_society/__init__.py` | Director, Architect, Researcher, Planner, Developer, Tester, Debugger, Security, Release |
| `agents/ultimate.py` | Director, Architect, Planner, Researcher, Developer, Tester, Critic, Security, Repair |
| `core/agent_manager.py` | Director, Architect, Developer, Tester, Critic, Security |

**Канонический список (Nexus 5.0):**  
Director, Architect, Researcher, Planner, Developer, Tester, Critic, Security, Repair

---

## 4. Конфликты API

### 4.1 Agent Interface

```
BaseAgent.execute(task)     — abstract, sync signature
DirectorAgent.execute(task) — async
PlannerAgent.run(task)      — async, другое имя метода
Agent.execute(task)         — sync (ultimate.py)
```

**Решение:** Единый `async execute(task: Task) -> AgentResult` через `BaseAgent`.

### 4.2 Security Return Types

```
PolicyEngine.check()      → dict {"allowed": bool}
PermissionManager.check() → bool
ApprovalGate.check()      → dict {"required": bool}
ApprovalManager.require() → bool
```

**Решение:** Единый `SecurityDecision` dataclass с полями `allowed`, `requires_approval`, `risk_level`.

### 4.3 Tool Interface

```
BaseTool.execute(**kwargs)  — abstract
ShellTool.execute(command)  — конкретный параметр
FilesystemTool.list_files() — другой метод, не наследует BaseTool
```

**Решение:** Единый `Tool` protocol: `name`, `description`, `permissions`, `execute(**kwargs)`.

---

## 5. Модули для объединения

| Группа | Действие |
|--------|----------|
| `core/` + `kernel/` | → `core/kernel.py`, `core/runtime.py` (NexusRuntime) |
| `runtime/` stubs | → реальная логика в `runtime/task_engine.py`, `planner.py`, `executor.py`, `verifier.py`, `repair_loop.py` |
| `workflow/` | → использовать `core/workflow.py`, удалить `workflow/` |
| `agent_society/` + `agents/` | → единое общество в `agents/society.py` |
| `memory/*` | → `manager.py`, `storage.py`, `retrieval.py` |
| `security/*` | → единый SecurityGate |
| `plugins/*` + `ecosystem/` | → PluginManager |
| `web/` + `api/` | → единый HTTP layer (Phase 8+) |
| `creator/` + `developer/` | → creator pipeline |

---

## 6. Целевая структура `nexus/core/`

```
nexus/core/
├── kernel.py       — NexusKernel: lifecycle, service registry
├── runtime.py      — NexusRuntime: главный класс системы
├── event_bus.py    — EventBus (из events.py)
├── registry.py     — ComponentRegistry (agents, tools, models, plugins)
├── state.py        — SystemState, TaskState
├── config.py       — Config loader (nexus.yaml + env)
├── engine.py       — NexusCore (compat wrapper → NexusRuntime)
├── tasks.py        — Task, TaskManager (без изменений)
├── loop.py         — AgentLoop
├── workflow.py     — WorkflowEngine
└── bus.py          — AgentBus
```

---

## 7. Agent Runtime Pipeline (целевой)

```
User Request
    ↓
TaskAnalyzer      — классификация задачи
    ↓
Planner           — декомпозиция в шаги
    ↓
TaskGraph         — DAG шагов
    ↓
Director          — назначение агентов
    ↓
Agent Team        — execute шагов
    ↓
Tools             — filesystem, shell, git, python
    ↓
Verifier          — проверка результатов
    ↓
Critic            — quality gate
    ↓
RepairLoop        — исправление ошибок (retry)
    ↓
Final Result
```

Каждый этап: состояние, история действий, ошибки, retry count.

---

## 8. Сравнение с целевыми системами

| Возможность | Cursor | Claude Code | Codex CLI | NexusCLI сейчас | Nexus 5.0 цель |
|-------------|--------|-------------|-----------|-----------------|----------------|
| Agent loop | ✅ | ✅ | ✅ | ⚠️ AgentLoop (не wired) | ✅ |
| Tool use | ✅ | ✅ | ✅ | ⚠️ ShellTool only | ✅ |
| Memory | ✅ | ✅ | ⚠️ | ❌ stub | ✅ |
| Model routing | ✅ | ✅ | ✅ | ⚠️ keyword | ✅ |
| Security/approval | ✅ | ✅ | ⚠️ | ⚠️ partial | ✅ |
| Plugin system | ✅ | ❌ | ❌ | ❌ stub | ✅ |
| Skills | ✅ | ⚠️ | ❌ | ❌ | ✅ |
| MCP | ✅ | ✅ | ✅ | ❌ stub | ✅ |
| Multi-agent | ⚠️ | ⚠️ | ❌ | ❌ stub | ✅ |

---

## 9. Риски миграции

1. **Обратная совместимость** — `NexusCore` должен остаться как thin wrapper над `NexusRuntime`
2. **Тесты** — 13 тестов `assert True` не сломаются, но не защищают от регрессий
3. **Дубли имён классов** — при объединении нужны aliases на переходный период
4. **Версии** — единый `nexus/version.py` до любых UI-изменений
5. **Dockerfile** — ссылается на `nexus chat`, команды нет
