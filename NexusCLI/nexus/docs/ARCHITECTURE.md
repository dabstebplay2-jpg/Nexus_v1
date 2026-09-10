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

Исполнение процессов проходит через порт `SandboxProvider` (`src/sandbox/ports.ts`) с `ExecutionPolicy`, `NetworkPolicy` и `PathScope`. Реализация по умолчанию — `LocalSandboxProvider`, и она честно объявляет отсутствие изоляции; результат каждого запуска несёт `enforced`, который попадает в metadata доказательства. Контейнерный backend подключается как аргумент конструктора, без изменений вызывающего кода.

Инкрементальный индекс workspace (`src/workspace/index/`) отделён от инструментов: `cache.ts` хранит метаданные файлов, `merkle.ts` — дерево с локальной инвалидацией, `fingerprint.ts` собирает снимок. Алгоритм completion fingerprint не изменился побайтово, потому что fingerprint — это идентичность доказательства: смена алгоритма обесценила бы всё ранее записанное evidence. Merkle root — дополнительные метаданные, а не идентичность.

Ledger и Evidence — отдельные типизированные записи с собственными таблицами; хранение реализует общий Store, чтобы транзакции объединяли изменения разных проекций. Не созданы пустые workspace packages ради количества директорий. Boundaries проверяются скриптом.

## Долговечность

SQLite: WAL, synchronous FULL, foreign keys, busy timeout, schema version через user_version. Schema v2: sessions (только header, без транскрипта), session_messages (позиционный транскрипт, WITHOUT ROWID), session_events (append-only ledger с монотонным seq), turns, plans, plan_steps, actions, tool_calls, evidence, verification_runs, context_epochs, queued_inputs, events, owners. Типизированные JSON payloads позволяют развивать поля; relational session_id/seq и индексы обеспечивают принадлежность и порядок. Миграция v1 -> v2 переносит conversation из session blob в session_messages внутри одной immediate transaction и только после этого удаляет избыточную таблицу messages.

Транскрипт дописывается, а не перезаписывается: `save()` сравнивает длину с сохранённой и проверяет граничное сообщение, и при несовпадении честно откатывается к полной перезаписи. Каждая запись добавляет конверт в session_events — только ссылку, без копии payload, — поэтому `seq` работает как долговечный курсор для timeline. Типизированные таблицы являются проекциями последнего состояния записи.

Session header — основная атомарная проекция; plans/plan_steps — диагностические проекции. Optimistic version защищает от потерянных обновлений. При коллизии ID между сессиями запись отклоняется. Admission и promotion используют SQLite transaction.

Чтение ограничено по стоимости: `header`, `record`, `count`, `page`, `tail` и `ledger` не загружают сессию целиком. Полное `list` сохранено намеренно — CompletionPolicy обязана оценивать всё доказательство и все действия перед авторизацией COMPLETE, и подмена этого выборкой означала бы, что авторизатор рассуждает о части записи.

Владелец — PID + случайный token в SQLite. Живой процесс блокирует вторую сессию того же workspace. Освобождать блокировку может только владелец token. Отдельные процессы не продолжают работу автоматически после падения. PID reuse приводит к консервативной блокировке, не к конкурентному запуску.

## Отличие от fork

CompletionPolicy, evidence freshness, защита test harness, UNKNOWN recovery и LoopGuard — самостоятельная реализация. Код OpenCode не копировался; переносились архитектурные идеи. Attribution и исходный MIT notice сохранены в THIRD_PARTY_NOTICES.md.

## Context Engine

Контекст собирается только в `ContextManager.build()`; второго пути к prompt нет. Приоритет объявлен явно: L0 critical (instructions, security framing, environment, routing и planning guidance, contract, tool schemas, AGENTS.md), L1 active working context (message groups текущей эпохи), L2 task memory (`taskMemory()` — детерминированный JSON из storage, а не текст модели), L3 project memory (`ProjectKnowledge`), L4 archive. L4 никогда не отправляется модели и доступен только через инструменты `history` и `output`.

Аллокация (`src/context/layers.ts`): pinned блоки допускаются первыми, оставшееся распределяется по слоям долями, зависящими от стадии compaction (soft 0.70, hard 0.85, emergency 0.95 от допустимого лимита — `budgetUtilisation`, а не от окна: `contextUtilisation` по построению не превышает 0.9, поэтому emergency на оконной шкале был бы недостижим). Блок, не поместившийся в долю своего слоя, исключается целиком, а не обрезается; нехватка места под pinned контекст возвращается как `overflow`, а не скрывается. Working floor 0.35 не участвует в аллокации знаний: prompt, который поместился только потому, что project knowledge вытеснил текущий результат инструмента, — не меньший prompt, а слепой.

Стадия вычисляется после compaction эпохи, поэтому только что сжатая сессия снова рендерится в полной детализации. Сама эпоха не изменилась: `compact()` двигает `epochStart`, пишет строку в context_epochs и эмитит `context_compressed`. Compaction переводит историю в L4, но не удаляет её.

Evidence не зависит от summary: CompletionPolicy читает доказательства из storage. Compaction может потерять recall модели, но не может создать, обновить или подделать доказательство. Ни один новый компонент не авторизует COMPLETED.

Project Intelligence (`src/project/knowledge.ts`) построен на существующем инкрементальном обходе `src/workspace/index/scan.ts`; второго обхода файловой системы и второго кэша нет. Свежесть — короткий TTL плюс signature по path/size/mtime, поэтому повторный обход стоит только метаданных. Недоступный workspace даёт `partial` запись, а не исключение: оптимизация не имеет права ронять run. Запись попадает в prompt через порт `ContextSource`, который существовал, но не имел реализаций.

Tool Router (`src/tools/router.ts`) — guidance и классификация, а не state machine: он ничего не блокирует и не отменяет permission engine. `shellRedirect` предлагает guarded эквивалент (`cat` -> `read`, `ls` -> `list`, `grep`/`rg` -> `search`, `find` -> `glob`, test runner -> `verify`) и намеренно молчит при redirection, command substitution, неизвестных и разрушительных командах: неверный redirect хуже отсутствующего.

Наблюдаемость — `ContextReport` и событие `context_report` на каждый собранный turn: окно, лимит, reserved output, использованные токены, стадия, detail scale, токены по категориям со слоем и долей, included/excluded ключи, счётчики истории и before/after compaction. Отчёт содержит только имена категорий и числа, без содержимого файлов, команд и секретов. Подробности — `NEXUS_CONTEXT_ARCHITECTURE.md`.
