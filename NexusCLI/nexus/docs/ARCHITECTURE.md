# Архитектура и исследование OpenCode

## Обнаруженная рабочая папка

Родительская папка содержит исходный monorepo OpenCode, manifest версии core 1.18.29; `.git` отсутствовал. Отдельного Nexus/NexusCLI в рекурсивном списке исходников, README и manifests не обнаружено. `artifacts/glm52-rise-video` — отдельные вспомогательные материалы; они не изменялись. Nexus создан отдельно, без добавления в workspaces OpenCode и без изменений его manifest/lockfile.

Изучены корневые README, AGENTS.md, CONTEXT.md, manifest; manifests Schema, Protocol, Core, LLM, CLI; документация LLM, TUI, спецификации V2; исходники и сценарии session prompt, runner, inbox, permission и compaction.

| Reference в OpenCode                                                              | Вывод для Nexus                                                              |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/core/src/session/runner/llm.ts`                                         | Один provider turn, затем settlement tools; не переносить legacy prompt loop |
| `packages/core/src/session/run-coordinator.ts`, `execution.ts`                    | Один владелец Session; разные workspace могут выполняться независимо         |
| `packages/core/src/session/input.ts`, `test/session-prompt.test.ts`               | Admission и promotion разделены, FIFO queue, steering на безопасной границе  |
| `packages/core/src/system-context/registry.ts`, `CONTEXT.md`                      | Независимые источники, baseline эпохи, изменения на границе turn             |
| `packages/core/src/session/compaction.ts`, `context-epoch.ts`                     | История долговечна; compaction меняет проекцию контекста                     |
| `packages/core/src/tool/registry.ts`, `tool-output-store.ts`                      | Фиксировать показанную модели реализацию, ограничивать output                |
| `packages/core/src/permission.ts`, `tool/read.ts`, `tool/write.ts`                | Core авторизует вызов, tools не решают permissions сами                      |
| `packages/llm/src/protocols/openai-compatible-chat.ts`, `route/transport/http.ts` | Wire-format и transport отдельно от agent orchestration                      |
| `packages/core/src/session/store.ts`, `database/migration/`                       | Состояние и история переживают процесс; migrations обязательны               |
| `specs/tui-package.md`, `packages/tui`, `packages/cli`, `packages/server`         | UI должен зависеть от публичного API, а не внутренних runner services        |
| `packages/opencode/src/session`, `packages/opencode/test`                         | Полезный legacy reference, но не архитектурная основа нового агента          |

В самом V2 runner reference есть незавершённые пункты: durable terminal statuses, retry limits и crash recovery. Nexus не объявляет их готовыми только потому, что они упомянуты в reference.

## Границы

Domain содержит данные и Store/Provider/Event/Permission порты. AgentLoop получает collaborators через конструктор. SQLite и HTTP создаются только в `composition.ts`. CLI вызывает `NexusAPI`; визуальное отображение не участвует в CompletionPolicy. Ни одного runtime import из OpenCode нет.

Ledger и Evidence — отдельные типизированные записи с собственными таблицами; хранение реализует общий Store, чтобы транзакции объединяли изменения разных проекций. Не созданы пустые workspace packages ради количества директорий. Boundaries проверяются скриптом.

## Долговечность

SQLite: WAL, synchronous FULL, foreign keys, busy timeout, schema version через user_version. Таблицы: sessions, messages, turns, plans, plan_steps, actions, tool_calls, evidence, verification_runs, context_epochs, queued_inputs, events, owners. Типизированные JSON payloads позволяют развивать поля; relational session_id/seq и индексы обеспечивают принадлежность и порядок.

Session JSON — основная атомарная проекция; messages/plans/plan_steps — диагностические проекции. Optimistic version защищает от потерянных обновлений. При коллизии ID между сессиями запись отклоняется. Admission и promotion используют SQLite transaction.

Владелец — PID + случайный token в SQLite. Живой процесс блокирует вторую сессию того же workspace. Освобождать блокировку может только владелец token. Отдельные процессы не продолжают работу автоматически после падения. PID reuse приводит к консервативной блокировке, не к конкурентному запуску.

## Отличие от fork

CompletionPolicy, evidence freshness, защита test harness, UNKNOWN recovery и LoopGuard — самостоятельная реализация. Код OpenCode не копировался; переносились архитектурные идеи. Attribution и исходный MIT notice сохранены в THIRD_PARTY_NOTICES.md.
