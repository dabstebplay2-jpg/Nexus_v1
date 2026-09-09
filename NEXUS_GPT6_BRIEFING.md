# Nexus — Briefing для GPT-6 Principal Architect

Дата: 9 сентября 2026 года  
Назначение: дать контекст перед архитектурным промптом. Документ не выбирает архитектуру, не утверждает миграцию и не заменяет проверку исходного кода.

## Что такое Nexus

Nexus — история нескольких связанных, но не объединённых продуктов: локальный coding agent, локальный чат, Python-платформа, Minecraft launcher, облачный AI-сайт, визуальный редактор и эксперименты с локальными моделями. Архив возник постепенно, поэтому одинаковые названия (`Core`, `memory`, `models`, `tools`, `runtime`) часто обозначают разные контракты.

Ценность проекта — сделать локально полезный и проверяемый AI-инструмент, который может вести диалог, выполнять ограниченные задачи, работать с файлами и моделями, сохранять состояние и объяснять, что действительно было сделано. Важно сохранить доказуемость результата и не превращать все исторические продукты в один необозримый runtime.

## Карта экосистемы

### NexusCLI/nexus

**Роль:** основной кандидат на execution foundation для coding/task режима.  
**Состояние:** отдельный TypeScript/Bun проект; выбранные тесты прошли (46/46 в указанном сценарии), но это не доказывает интеграцию с Axiom UI или production readiness.  
**Сильные стороны:** AgentLoop, tool executor, permissions, recovery, evidence/completion policy, durable inbox/action ledger, SQLite.  
**Проблемы:** Bun/Node конфликт, крупный JSON в session, нет доказанного общего live token event contract; родительская папка также содержит OpenCode reference tree.

### Axiom

**Роль:** основа локального чата, provider catalog, storage lifecycle и Web UI.  
**Состояние:** TypeScript/Node/React/Vite/Express/SQLite; выбранные тесты прошли (32/32 после исправления локальных workspace links в копии).  
**Сильные стороны:** ChatCore, provider registry, context policy, cancellation/partial persistence, migrations, loopback API, React client.  
**Проблемы:** README прямо исключает agents/tools/MCP/RAG; transport и event model нужно сопоставить с AgentLoop; архивные package links не переносимы автоматически.

### Nexus Minecraft

**Роль:** самостоятельный Windows desktop launcher и источник контрактов для jobs, instances, runtime discovery, process supervision, auth lifecycle и release verification.  
**Состояние:** новая копия v1.1.4.2 — рабочий MVP/предрелизный продукт; старая v0.7.13 — baseline. Stateful core и live GUI/OAuth/Popen/updater проверены ограниченно.  
**Можно использовать:** state machine downloads после усиления persistence/cancel/checksum; generic instance/workspace lifecycle; RuntimeResolver boundary; ProcessSupervisor contract; token/provider lifecycle; signed release contract.  
**Нельзя переносить как есть:** монолитный Launcher, PySide6 UI, Minecraft loader/Modrinth/JVM logic, plaintext OAuth token files, permissive updater fallback и Windows-specific paths.

### Старый Nexus

**Роль:** исторический источник идей для role-oriented planning, dependency graph, activity events, CLI UX и тестовых сценариев.  
**Что сохранить:** отдельные сценарии orchestration, domain vocabulary и regression cases, если они подтверждены тестами.  
**Что исключить из будущего Core:** legacy text-to-action regex protocol, in-process/vector memory как доказанный RAG, non-blocking security gate, completion без независимого evidence и декоративные subsystem stubs.

### MiniCursor (`cli`)

**Роль:** отдельный local GGUF/llama.cpp и QLoRA/training продукт.  
**Состояние:** полезный hardware/inference experiment; выбранные тесты 24 прошли, 4 выявили конфликт thinking contract.  
**Использовать:** model discovery/configuration ideas, local backend adapter, hardware diagnostics.  
**Не смешивать:** training dependencies и fixed-plan agent router с Nexus Agent Core.

### Nexus Maker

**Роль:** отдельный визуальный редактор и потенциальный будущий client/tool.  
**Состояние:** React/Zustand/Vite, document format v3, geometry/layout tests; grouping/reparenting bug подтверждён тестом.  
**Использовать:** document model, import/export, coordinate/layout testing.  
**Не считать Core:** canvas UI, editor store и весь visual product.

### Nexus_Ai_site / Cloud / IDE / Browser

**Роль:** отдельная cloud/client ecosystem: accounts, billing, connectors, Web UI, Code-OSS IDE и Electron browser.  
**Использовать:** выборочно UX, model catalog ideas, streaming and connector scenarios.  
**Граница:** cloud auth, billing, tenant data, browser automation and IDE packaging не доказаны как часть local Nexus Core.

### Create_my_AI_NEXUSAI, no-code и NexusTest

`Create_my_AI_NEXUSAI` — исследовательская ветка собственной модели и dataset/training pipeline; `no-code` — простой chat prototype; `NexusTest` — минимальный тестовый fixture, а не фундамент. Их нельзя использовать как доказательство готовности Core.

## Что уже доказано

- В NexusCLI есть наиболее целостный локальный execution path с policy/evidence/recovery.
- В Axiom есть наиболее пригодный локальный chat/storage/UI lifecycle.
- В Minecraft есть практические stateful domain modules, но не готовый универсальный launcher runtime.
- Исторические тесты показывают работоспособность отдельных срезов, а не интеграцию всех проектов.
- Ни один архивный проект целиком не является готовым Nexus 1.0.

## Проверка утверждений аудитов

| Finding | Source | Confidence | Needs verification |
|---|---|---:|---|
| `NexusCLI/nexus` содержит AgentLoop, tool executor, permissions, recovery и completion/evidence policy | FACT FROM CODE; `NEXUS_COMPONENT_ANALYSIS.md` | Высокая | Интеграционный run с реальным provider и side effect |
| 46 тестов NexusCLI прошли в указанном локальном сценарии | FACT FROM CODE / TEST RESULT; `NEXUS_COMPONENT_ANALYSIS.md` | Средняя | Повторить в чистом checkout и CI |
| Axiom является chat/storage/UI foundation, а не готовым Agent Core | FACT FROM CODE + AUDIT FINDING | Высокая | Проверить актуальный scope после будущих изменений |
| Axiom 32/32 прошли только после создания локальных workspace links | FACT FROM CODE / TEST RESULT | Высокая | Проверить чистую установку без архивных junctions |
| `NexusCLI/nexus` использует Bun, Axiom — Node.js | FACT FROM CODE | Высокая | Зафиксировать поддерживаемые версии runtime |
| Старый Nexus CLI полностью не подключён | Старый AUDIT FINDING | Низкая/устарела | Перепроверено глубже: текущий runtime собирает executor; проверить оставшиеся entry points |
| Старый Nexus имеет security gate, который не гарантирует отказ/approval | FACT FROM CODE + AUDIT FINDING | Высокая | Добавить negative execution test перед любым reuse |
| `VectorMemory` старого Nexus доказывает vector search/RAG | ASSUMPTION из названий модулей | Низкая | Проверить backend, indexing, similarity и persistence |
| Minecraft содержит две копии: v1.1.4.2 и v0.7.13 | FACT FROM CODE/history | Высокая | Проверить clean commit/tag и release provenance |
| Новая Minecraft-копия функционально шире и должна быть canonical source | AUDIT FINDING / RECOMMENDATION | Средняя | Сравнить clean builds, data compatibility и regression suite |
| Minecraft DownloadManager — persistent JSON ledger с atomic replace и process-wide lock | FACT FROM CODE | Высокая | Multi-process, corruption recovery, cancellation и schema tests |
| Minecraft DownloadManager является реальным универсальным downloader | ASSUMPTION | Низкая | Проверить network worker ownership; отчёт указывает, что это только ledger |
| Minecraft Launcher реально запускает JVM через Popen | FACT FROM CODE | Высокая | Mocked lifecycle tests, process tree and restart reconciliation |
| Minecraft token files хранятся plaintext JSON | FACT FROM CODE | Высокая | Проверить все provider paths и existing-user migration needs |
| Minecraft updater допускает обновление без внешнего checksum | FACT FROM CODE | Высокая | Проверить каждый asset path и подпись/installer behavior |
| Cloud memory, MiniCursor memory и legacy memory взаимозаменяемы | ASSUMPTION | Низкая | Сопоставить schema, retention, privacy and retrieval semantics |
| `NexusCLI` parent tree полностью является кодом Nexus | ASSUMPTION | Низкая | Отделить standalone `nexus` от OpenCode reference и licensing |
| Самый старый/новый проект определяется только именем и version string | ASSUMPTION | Низкая | Провести отдельный git/tag/commit chronology audit |
| Axiom loopback host/origin checks являются полноценной public authentication | ASSUMPTION | Низкая | Провести threat-model и network exposure review |
| Исторический passing test set равен production readiness | ASSUMPTION | Низкая | Ввести risk-tiered definition of done |

## Что ещё не принято

GPT-6 должен отдельно решить host runtime, repository structure, Core boundary, Agent/Chat separation, tool/event protocols, storage, memory, context, secrets, plugins, process management, security, local/cloud boundary, provider registry, testing standard, migration and release identity. Полный список вопросов находится в [NEXUS_DECISION_REGISTER.md](C:/Nexus_History/NEXUS_DECISION_REGISTER.md), а конфликтные места — в [NEXUS_ARCHITECTURAL_CONFLICTS.md](C:/Nexus_History/NEXUS_ARCHITECTURAL_CONFLICTS.md).

## Ошибки, которые нельзя повторять

1. Объявлять готовым проект по README, названию модуля или passing unit tests без проверки реального пути выполнения.
2. Смешивать Chat, Agent, Cloud и domain launcher state в одну таблицу и один loop.
3. Переносить plaintext secrets, permissive updater или non-blocking security gate в новую основу.
4. Делать выбор runtime/schema без измерения migration и packaging cost.
5. Параллельно развивать дублирующие launcher/CLI реализации без canonical source и compatibility policy.

## Цели Nexus v1.0 как контекст

Архитектурный промпт должен уточнить проверяемый минимальный продукт, но исходный контекст таков: полезный local-first assistant; отдельные chat и task semantics; ограниченные безопасные file/tool operations; сменные model providers; durable sessions/jobs/evidence; восстановление после отмены и перезапуска; понятный CLI и один основной UI; наблюдаемость и воспроизводимые тесты. Marketplace, cloud teams, browser, IDE и Minecraft launcher — отдельные направления, а не обязательная часть первого релиза.

## Критический review до проектирования

**Пять ошибок, способных погубить проект:** отсутствие чёткой границы и success criteria; прямое объединение несовместимых runtimes/schemas; небезопасные tools/secrets/updates; гонка нескольких реализаций без canonical source; попытка доказать production readiness только тестами прототипов.

**Риск переусложнения:** Core может превратиться в платформу для chat, coding, Minecraft, browser, IDE, cloud, plugins и training одновременно. Это размоет ownership, тестируемость и release boundary.

**Что не делать в первые месяцы:** не строить marketplace/teams/browser/cloud billing; не переносить весь старый Nexus и OpenCode; не добавлять vector/RAG и multi-agent без измеренного базового сценария; не менять исходные проекты ради удобства миграции.

**Что сделать первым:** зафиксировать scope и threat model; выбрать runtime/schema boundaries; определить canonical Agent/Chat contracts; собрать минимальный вертикальный сценарий с durable state, permissions, evidence и UI/API contract tests.

**Как понять, что Nexus полезен:** новый пользователь может выполнить ограниченную реальную задачу от запроса до проверенного результата, увидеть действия и ошибки, отменить/возобновить работу, перезапустить приложение без потери состояния и заменить provider без переписывания клиента; эти свойства подтверждены автоматическими и ручными acceptance tests.

## Ограничение для GPT-6

Этот briefing не содержит готовой архитектуры. Он подготовлен, чтобы Principal Architect принимал решения на подтверждённых границах и явно отмечал, где требуется дополнительная проверка исходного кода.
