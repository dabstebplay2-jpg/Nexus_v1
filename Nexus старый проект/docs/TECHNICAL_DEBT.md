# NexusCLI — Технический долг

**Дата:** 2026-09-01  
**Приоритет:** P0 = критический, P1 = высокий, P2 = средний, P3 = низкий

---

## P0 — Критический (блокирует production)

### TD-001: CLI не подключён к ядру

**Описание:** Команды `task`, `status`, `agents` в CLI печатают hardcoded dict, не вызывают `NexusCore` или любой backend.

**Файлы:** `nexus/cli/main.py`, `nexus/cli/shell.py`

**Влияние:** Пользователь видит иллюзию работающей системы.

**Решение:** Phase 7 — все команды через `NexusRuntime`.

---

### TD-002: Хаос версий

**Описание:** 8+ разных версий в коде: 3.0rc1, 3.0rc2, 3.1, 4.0, 5.0, 9.0, 10.0–19.0.

**Файлы:** `pyproject.toml`, `nexus.yaml`, `cli/*`, `ui/*`, `api/*`, `runtime/*_manifest.py`, `README*`

**Влияние:** Невозможно определить реальную версию, путаница для пользователей и разработчиков.

**Решение:** Phase 1 — единый `nexus/version.py`.

---

### TD-003: ~140 изолированных модулей

**Описание:** Большинство модулей не импортируются и не используются. Создают ложное впечатление функциональности.

**Влияние:** Сложность навигации, риск дублирования при разработке.

**Решение:** Поэтапная интеграция через `NexusRuntime`, удаление дубликатов в Phase 5+.

---

### TD-004: Тесты не тестируют

**Описание:** 13 из 15 тестов — `assert True`. Coverage ~5%.

**Файлы:** `tests/test_v*.py`, `tests/test_runtime.py`, `tests/test_nexus3.py`

**Влияние:** Нет защиты от регрессий при миграции.

**Решение:** Phase 8 — реальные тесты с coverage ≥80%.

---

## P1 — Высокий

### TD-005: Дублирование классов с одинаковыми именами

| Класс | Файлы | Риск |
|-------|-------|------|
| `AgentFactory` | `agents/factory.py`, `agents/agent_factory.py` | Import confusion |
| `AgentManager` | `agents/manager.py`, `core/agent_manager.py` | Разный API |
| `AgentBus` | `agents/bus.py`, `core/bus.py` | sync vs async |
| `WorkflowEngine` | `workflow/engine.py`, `core/workflow.py` | stub vs real |
| `ProviderRegistry` | `models/providers.py`, `models/provider_registry.py` | Разный API |
| `Sandbox` | `security/sandbox.py`, `runtime/sandbox.py` | Идентичны |
| `AutonomousRuntime` | `core/autonomous.py`, `platform/autonomous_runtime.py` | Разный API |
| `EventBus` | `core/events.py`, `kernel/event_bus.py` | async vs sync |

**Решение:** Консолидация в Phase 1–2, deprecation aliases.

---

### TD-006: BaseAgent не используется

**Описание:** ABC `BaseAgent` с `execute()` определён, но ни один агент не наследует. `DirectorAgent` — standalone с другим API.

**Файлы:** `agents/base.py`, `agents/director.py`, все специализированные агенты

**Решение:** Phase 2 — все агенты наследуют `BaseAgent`.

---

### TD-007: ToolRegistry без get()

**Описание:** `ToolExecutor` и `ToolCaller` вызывают `registry.get(name)`, но `ToolRegistry` имеет только `register()` и `list()`.

**Файлы:** `tools/registry.py`, `tools/executor.py`, `tools/caller.py`

**Влияние:** AttributeError при попытке использовать executor.

**Решение:** Phase 4 — добавить `get()`, объединить executor/caller.

---

### TD-008: Security без единого pipeline

**Описание:** 4 независимых checker'а с несовместимыми return types. Ни один не вызывается из агентов или tools.

**Файлы:** `security/policy_engine.py`, `permissions.py`, `gate.py`, `approval.py`

**Решение:** Phase 4 — единый `SecurityGate` с `SecurityDecision` dataclass.

---

### TD-009: Три списка агентов

**Описание:** Разные наборы ролей в `agent_society/`, `agents/ultimate.py`, `core/agent_manager.py`.

**Решение:** Phase 2 — канонический список в `agents/society.py`.

---

## P2 — Средний

### TD-010: Два CLI entry point

**Файлы:** `cli/main.py` (активный, v4.0), `cli/cli/main.py` (legacy, v3.1)

**Решение:** Deprecate `cli/cli/main.py`, удалить в Phase 7.

---

### TD-011: Memory — 6 дубликатов list.append

**Файлы:** `memory/store.py`, `manager.py`, `context.py`, `intelligence.py`, `semantic.py`, `vector_store.py`

**Решение:** Phase 3 — один `MemoryStore` + специализированные facades.

---

### TD-012: Три model router'а

**Файлы:** `models/router.py`, `task_router.py`, `ultimate_router.py`

**Решение:** Phase 5 — единый `ModelRouter`.

---

### TD-013: MCP без протокола

**Описание:** `MCPServer.expose()` и `MCPClient.connect()` возвращают dict без реального JSON-RPC/stdio.

**Файлы:** `mcp/server.py`, `mcp/client.py`

**Решение:** Phase 5+ — реализовать MCP или удалить до готовности.

---

### TD-014: Web/API без HTTP-сервера

**Описание:** `WebBackend.health()` и `NexusServer.health()` — dict без FastAPI/Flask.

**Файлы:** `web/backend.py`, `api/server.py`

**Решение:** Phase 8+ — единый HTTP layer или удалить.

---

### TD-015: Dockerfile с несуществующей командой

**Файл:** `Dockerfile` — `CMD ["nexus","chat"]`, команды `chat` нет.

**Решение:** Phase 7 — `CMD ["nexus"]`.

---

### TD-016: 5 version manifest файлов

**Файлы:** `runtime/nexus3_rc.py`, `nexus3_manifest.py`, `release_manifest.py`, `version_manifest.py`, `upgrade_manifest.py`

**Описание:** Версии 3.0–19.0 как маркетинговые константы без связи с кодом.

**Решение:** Удалить или архивировать в Phase 1, оставить `nexus/version.py`.

---

### TD-017: Отсутствие `__init__.py` в пакетах

**Пакеты без init:** `security/`, `plugins/`, `mcp/`, `web/`, `creator/`

**Влияние:** Namespace packages работают, но нет публичного API.

**Решение:** Добавить `__init__.py` с exports при интеграции.

---

### TD-018: ShellTool с shell=True

**Файл:** `tools/shell.py`

**Описание:** `subprocess.run(shell=True)` — security risk, нет обработки stderr/exit codes.

**Решение:** Phase 4 — shell=False по умолчанию, whitelist команд, SecurityGate.

---

## P3 — Низкий

### TD-019: OpenAI provider без парсинга ответа

**Файл:** `models/providers/openai.py`

**Описание:** Возвращает сырой `response.json()`, не извлекает content.

**Решение:** Phase 5.

---

### TD-020: KnowledgeGraph — однострочная заглушка

**Файл:** `memory/knowledge_graph.py`

**Описание:** `add()` возвращает dict, ничего не сохраняет.

**Решение:** Phase 3.

---

### TD-021: Creator/Developer дублирование

**Файлы:** `creator/project_builder.py`, `developer/product_creator.py`

**Решение:** Объединить в creator pipeline, Phase 8+.

---

### TD-022: Ecosystem marketplace дублирует plugins

**Файлы:** `ecosystem/marketplace.py`, `plugins/marketplace.py`

**Решение:** Phase 5 — единый PluginManager.

---

### TD-023: build/ артефакты в репозитории

**Описание:** `build/lib/nexus/` — копия исходников, не должна быть в git.

**Решение:** Добавить в `.gitignore`.

---

### TD-024: Множество CHANGELOG/README файлов

**Файлы:** `CHANGELOG.md`, `CHANGELOG_ULTIMATE.md`, `README.md`, `README_NEXUS_5_BETA.md`, `NEXUS_3_*.md`, `UPGRADE_*.md`

**Решение:** Консолидировать в один README + CHANGELOG в Phase 8.

---

## Сводка

| Приоритет | Количество | Оценка усилий |
|-----------|------------|---------------|
| P0 | 4 | 2–3 дня |
| P1 | 5 | 3–5 дней |
| P2 | 9 | 5–7 дней |
| P3 | 6 | 2–3 дня |
| **Итого** | **24** | **~3 недели** |

---

## Зависимости между долгами

```
TD-002 (версии) ──→ TD-001 (CLI wiring) ──→ TD-004 (тесты)
        │
        ▼
TD-003 (изоляция) ──→ TD-005 (дубликаты) ──→ TD-006 (BaseAgent)
        │                                           │
        ▼                                           ▼
TD-007 (tools bug) ──→ TD-008 (security) ──→ TD-018 (shell safety)
```

**Рекомендуемый порядок устранения:** TD-002 → TD-001 → TD-005 → TD-006 → TD-007 → TD-008 → TD-004
