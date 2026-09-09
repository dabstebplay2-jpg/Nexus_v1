# NexusCLI — Текущее состояние проекта

**Дата аудита:** 2026-09-01  
**Версия пакета (pyproject.toml):** `3.0.0rc1`  
**Версия конфига (nexus.yaml):** `3.0.0rc2`  
**Файлов Python в `nexus/`:** ~146  
**Тестов:** 15 (из них реально проверяют код — 2)

---

## 1. Что это за проект

NexusCLI (`nexus-ai-platform`) — Python-платформа, задуманная как **персональная AI Operating System** с CLI-интерфейсом. Проект содержит широкую модульную архитектуру (~40 подсистем), но большинство модулей — архитектурные заготовки без интеграции.

**Точка входа:** `nexus` → `nexus.cli.main:app` (Typer)

**Зависимости:** typer, rich, httpx, pyyaml, pydantic, pytest

---

## 2. Что реально работает

### 2.1 CLI и UI

| Компонент | Файл | Статус |
|-----------|------|--------|
| Typer CLI entry point | `nexus/cli/main.py` | ✅ Работает |
| Интерактивная оболочка (REPL) | `nexus/cli/shell.py` | ✅ Работает |
| Boot-анимация | `nexus/ui/animations.py` | ✅ Работает |
| Dashboard | `nexus/ui/dashboard.py` | ✅ Работает (UI) |

### 2.2 Ядро

| Компонент | Файл | Статус |
|-----------|------|--------|
| `NexusCore` — оркестратор | `nexus/core/engine.py` | ✅ Частично: создаёт bus/tasks/agents, вызывает Director |
| `EventBus` (async) | `nexus/core/events.py` | ✅ In-memory события с timestamp |
| `TaskManager` + `Task` dataclass | `nexus/core/tasks.py` | ✅ Создание и список задач |
| `AgentLoop` | `nexus/core/loop.py` | ✅ Async pipeline plan→generate→verify (при инъекции зависимостей) |
| `WorkflowEngine` (multi-agent) | `nexus/core/workflow.py` | ✅ Async execute через агентов |

### 2.3 Агенты

| Компонент | Файл | Статус |
|-----------|------|--------|
| `AgentRegistry` | `nexus/agents/registry.py` | ✅ Регистрирует Director, get_default() |
| `DirectorAgent` | `nexus/agents/director.py` | ✅ Минимальный async execute/run |
| `BaseAgent` (ABC) | `nexus/agents/base.py` | ⚠️ Определён, но не используется наследниками |

### 2.4 Инструменты

| Компонент | Файл | Статус |
|-----------|------|--------|
| `ShellTool` | `nexus/tools/shell.py` | ✅ Реальный subprocess (shell=True) |
| `FilesystemTool` | `nexus/tools/filesystem.py` | ✅ list_files через Path.iterdir |
| `ToolRegistry` | `nexus/tools/registry.py` | ⚠️ register/list, но нет get() |

### 2.5 Модели

| Компонент | Файл | Статус |
|-----------|------|--------|
| `AdaptiveModelRouter` | `nexus/models/router.py` | ✅ Keyword-эвристика |
| `OpenAICompatibleModel` | `nexus/models/providers/openai.py` | ✅ Реальный HTTP POST (без парсинга ответа) |

### 2.6 Security (минимальная логика)

| Компонент | Файл | Статус |
|-----------|------|--------|
| `PermissionManager` | `nexus/security/permissions.py` | ⚠️ Substring-блокировка delete/format/shutdown |
| `ApprovalGate` / `ApprovalManager` | `security/gate.py`, `approval.py` | ⚠️ Keyword-проверки |
| `AuditLog` | `nexus/security/audit.py` | ⚠️ In-memory журнал |

### 2.7 Память

| Компонент | Файл | Статус |
|-----------|------|--------|
| `ProjectMemory` | `nexus/memory/project_memory.py` | ⚠️ Dict key-value по проекту |

---

## 3. Что является заглушкой

### 3.1 Полностью изолированные модули (0 импортов из проекта)

- **`nexus/kernel/`** — NexusKernel, EventBus, ServiceManager (не подключены)
- **`nexus/runtime/`** — 13 файлов: executor, repair_loop, манифесты версий 3.0–19.0
- **`nexus/workflow/`** — graph + engine (stub)
- **`nexus/security/`** — sandbox, policy_engine (возвращают dict без логики)
- **`nexus/plugins/`** — sdk, loader, marketplace (in-memory register)
- **`nexus/mcp/`** — server/client (нет MCP-протокола)
- **`nexus/web/`** — control_plane, backend (health dict)
- **`nexus/creator/`** — project_builder, production_engine
- **`nexus/memory/`** — 8 из 10 файлов дублируют list.append pattern
- **`nexus/models/`** — provider.py, registry.py, provider_registry.py

### 3.2 CLI-команды — захардкоженный вывод

Команды `doctor`, `status`, `agents`, `tools`, `memory`, `plugins`, `kernel`, `task` в `main.py` и `shell.py` **не обращаются** к backend-модулям. Печатают статический текст.

### 3.3 Специализированные агенты

Все агенты кроме Director — stub с `async run()` → статический dict:
- PlannerAgent, CriticAgent, CodingAgent, ResearchAgent, SecurityAgent

### 3.4 Тесты

13 из 15 тестов — `assert True`. Реальные:
- `test_core.py` — проверяет наличие TaskManager
- `test_loop.py` — проверяет существование класса AgentLoop

---

## 4. Граф реальной интеграции

```
pyproject.toml
    └── nexus.cli.main:app
            ├── nexus.ui.dashboard (launch)
            └── nexus.cli.shell (default REPL)
                    └── nexus.ui.animations

nexus.core.engine.NexusCore  ← НЕ подключён к CLI
    ├── nexus.core.events.EventBus
    ├── nexus.core.tasks.TaskManager
    └── nexus.agents.registry.AgentRegistry
            └── nexus.agents.director.DirectorAgent

[ОСТАЛЬНЫЕ ~140 МОДУЛЕЙ — ИЗОЛИРОВАНЫ]
```

---

## 5. Хаос версий

| Источник | Версия / название |
|----------|-------------------|
| `pyproject.toml` | 3.0.0rc1 |
| `nexus.yaml` | 3.0.0rc2 |
| `cli/main.py` | Nexus 4.0 Genesis |
| `cli/cli/main.py` | Nexus 3.1 Genesis |
| `cli/shell.py` | NEXUS 4.0 GENESIS |
| `ui/dashboard.py` | Nexus 3.1 Genesis |
| `api/server.py` | Nexus v5.0 |
| `api/runtime.py` | v4.0 |
| `README.md` | v9.0 Creator |
| `README_NEXUS_5_BETA.md` | 5.0 Beta |
| `runtime/version_manifest.py` | 10.0–19.0 |
| `runtime/nexus3_rc.py` | 3.0.0-RC1 |

---

## 6. Структура пакетов

```
nexus/
├── agents/          16 файлов — 1 рабочий (Director), остальные stub
├── agent_society/    1 файл  — константа AGENTS
├── ai/               runtime, function_calling (stub)
├── api/              server, runtime (health dict)
├── automation/       stub
├── autonomous/       stub
├── cli/              4 файла — рабочий entry point
├── code/             test_runner, code_builder (stub)
├── compat/           layer (stub)
├── core/            18 файлов — engine + loop рабочие, остальное partial/stub
├── creator/          3 файла — stub
├── developer/        product_creator (stub)
├── digital_twin/     foundation docstring
├── ecosystem/        marketplace (stub)
├── evaluation/       engine (stub)
├── intelligence/     reasoning_engine (stub)
├── kernel/           4 файла — не подключены
├── learning/         foundation docstring
├── mcp/              2 файла — stub
├── memory/          10 файлов — почти все stub
├── models/           9 файлов — router + openai partial
├── network/          swarm, node_orchestrator (stub)
├── neural_core/      reflection, reasoning (stub)
├── nodes/            cluster (stub)
├── observability/    telemetry, logs (stub)
├── platform/         autonomous_runtime (stub)
├── plugins/          4 файла — stub
├── quality/          release_gate (stub)
├── release/          pre_release (stub)
├── runtime/         13 файлов — stub + version manifests
├── sandbox/          manager (stub)
├── security/         6 файлов — partial
├── simulation/       foundation docstring
├── storage/          database (stub)
├── studio/           workbench, project_manager (stub)
├── tasks/            engine (stub)
├── tools/           10 файлов — shell working, остальное partial/stub
├── ui/               dashboard, animations (working)
├── web/              2 файла — stub
├── workflow/         2 файла — stub
└── workspace/        manager (stub)
```

---

## 7. Вывод

**NexusCLI сегодня** — архитектурный прототип с:
- Рабочим CLI/REPL и UI-оболочкой
- Минимальным ядром (`NexusCore` + `DirectorAgent`)
- Одним реальным инструментом (`ShellTool`)
- Одним частичным LLM-провайдером (`OpenAICompatibleModel`)
- ~140 изолированными модулями-заготовками

**Для production-ready AI OS** необходимо: единое ядро (`NexusRuntime`), реальный agent pipeline, интеграция подсистем, унификация версий, настоящие тесты.
