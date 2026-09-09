# Nexus v1.0 — Red Team Review

Дата: 9 сентября 2026 года  
Роль: независимый Principal Engineer Reviewer  
Цель: попытаться доказать, что текущий план Nexus v1.0 провалится при прямом объединении найденных компонентов.  
Ограничение: это не новая архитектура и не список функций. Здесь перечислены только точки отказа, скрытая сложность, технический долг и причины упростить scope.

## Критический вывод

Наиболее вероятный сценарий провала — не отсутствие отдельных рабочих модулей, а ложное ощущение, что их можно сложить в один продукт. NexusCLI уже имеет сильный task execution path, Axiom — сильный chat/storage/UI path, а остальные проекты дают доменные и экспериментальные куски. Но у них разные runtime, state machines, schemas, event semantics, trust boundaries и определения завершения.

Если начать перенос до фиксации этих различий, Nexus v1.0 получит широкий интерфейс и несколько работающих демонстраций, но не будет надёжно отвечать на базовый вопрос: что именно произошло, можно ли этому доверять, и восстановится ли система после ошибки.

Ниже «провал» означает хотя бы один из результатов: потеря состояния, ложное сообщение об успехе, небезопасное действие, невозможность воспроизвести ошибку, блокирующая сложность сборки или система, которую нельзя поддерживать одной командой.

## 1. Agent Core

### Как текущая ставка может оказаться ошибочной

Сильные свойства `NexusCLI/nexus` — AgentLoop, tools, permissions, recovery и completion policy — выглядят как готовое ядро. Но они проверены внутри собственного runtime и собственного storage contract. Это не доказывает, что тот же loop корректно работает с Axiom sessions, live UI events, другими provider adapters и долгими внешними процессами.

Главная опасность — принять внутреннюю корректность AgentLoop за системную корректность Nexus. При интеграции могут расходиться ownership, cancellation, session version и момент записи evidence. Тогда loop будет формально завершать задачу, а клиент или store будет видеть промежуточное состояние.

### Скрытая сложность

- У Chat и Task различаются completion semantics. Простое добавление `mode` не устраняет различия в context, permissions, retries и recovery.
- Tool execution меняет внешний мир. Повтор после UNKNOWN может создать второй файл, второй процесс или повторный запрос к внешнему сервису.
- Steering/inbox, cancellation и provider turn должны быть согласованы с transaction boundaries. Иначе команда пользователя окажется обработанной дважды или потеряется.
- Verification не является универсальным доказательством: проверка exit code, diff и наличие файла не равна проверке пользовательского результата.
- Долгие tool calls требуют process identity, timeout, output capture и reconciliation; обычный request/response loop этого не даёт.

### Технический долг

- Крупный JSON в session ограничивает рост задач и усложняет частичное восстановление.
- Внутренний TypeScript API ещё не является стабильным внешним contract.
- Live token/event streaming не имеет доказанного общего протокола для Web UI.
- Provider-specific assumptions могут проникнуть в Core через быстрые adapters.
- Passing tests фиксируют текущие сценарии, но не покрывают реальные side effects и restart paths.

### Что может сломаться через 6 месяцев

Рост истории и action ledger начнёт замедлять save/recovery. Новая версия provider изменит tool-call/stream behavior. Исправление одного retry приведёт к повторному side effect. После crash Core будет считать задачу активной или завершённой неправильно. Отладка потребует воспроизводить редкие комбинации steering, cancellation и network timeout.

### Что кажется простым, но сложнее

«Подключить AgentLoop к Axiom API» выглядит как transport task. На деле нужно согласовать lifecycle, event ordering, reconnect, authorization, persistence, error taxonomy и user-visible completion.

### Что нужно упростить

Нельзя считать универсальными одновременно Agent, Chat, background jobs и arbitrary process execution. Чем больше режимов принимается в v1.0 без доказанного общего lifecycle, тем выше вероятность неустранимого Core.

## 2. Axiom

### Как текущая ставка может оказаться ошибочной

Axiom выглядит готовой оболочкой благодаря React UI, ChatCore, migrations, provider registry и тестам. Но это alpha локального чата. README не заявляет agents, tools, MCP или RAG. Если использовать Axiom как готовый frontend для Agent Core, большая часть поведения будет добавлена через неявные hooks и специальные ветки.

### Скрытая сложность

- Chat UI ожидает generation lifecycle, а Agent UI должен показывать approvals, tool calls, evidence, retries и partial failure.
- NDJSON/stream transport не равен durable event log. При reconnect нужно знать, что уже было принято клиентом.
- Loopback host/origin checks защищают ограниченный сценарий, но не заменяют auth при изменении deployment boundary.
- Axiom packages собираются после исправления локальных workspace links; архивное окружение само по себе не является воспроизводимой установкой.
- Provider registry для chat не обязательно выражает capability, необходимую tools и agent turns.

### Технический долг

- UI может начать зависеть от внутренних Agent event details.
- API и storage types могут расходиться при параллельном развитии.
- Копирование сайта или IDE UX притащит cloud hooks, auth и модели в local client.
- Поведение отмены и partial persistence будет иметь разные значения для chat и task.

### Что может сломаться через 6 месяцев

Изменение event payload сломает старый Web UI. Повторная установка без junctions перестанет собирать packages. Пользователь увидит “completed”, хотя tool action ещё выполняется. Ошибка provider при streaming оставит `generating` или создаст дубликат assistant message.

### Что кажется простым, но сложнее

«Добавить Agent tab в Axiom» означает добавить новую state machine, а не новый компонент интерфейса.

### Что нужно упростить

Нельзя использовать весь Axiom frontend как универсальный клиент до того, как зафиксированы event и API semantics. UI scope должен оставаться меньше, чем совокупность всех исторических screens.

## 3. Memory

### Как текущая ставка может оказаться ошибочной

В архиве есть conversation history, task context, user profile, JSON memory, cloud user memory и legacy `VectorMemory`. Их наличие создаёт иллюзию, что memory subsystem уже существует. На самом деле это разные функции с разной надёжностью и privacy model.

### Скрытая сложность

- Неясная граница памяти приводит к отправке старых инструкций, секретов или нерелевантных tool results в новый prompt.
- Retrieval должен иметь provenance, ranking, deletion и stale-data behavior; название `VectorMemory` этого не гарантирует.
- Profile facts и task facts нельзя удалять или обновлять одинаково.
- Memory writes, generated summaries и user corrections требуют конфликтной политики.
- Размер контекста влияет на latency и стоимость provider; silent truncation меняет смысл задачи.

### Технический долг

- Несколько несовместимых форматов persistence.
- Нет доказанного единого retention/export/delete contract.
- Непроверенная vector/RAG семантика может стать скрытой зависимостью Core.
- Memory tests не доказывают privacy isolation между sessions/users.

### Что может сломаться через 6 месяцев

Контекст начнёт расти быстрее, чем его можно контролировать. Старые или ошибочные факты будут повторяться с высокой уверенностью. Удаление проекта не удалит копии в summaries/index/cache. Изменение embedding/model сделает старый index несопоставимым.

### Что кажется простым, но сложнее

«Сохранить важное после диалога» — это policy, provenance, consent, correction и deletion, а не вызов `save()`.

### Что нужно упростить

Нельзя считать profile, history, task context и vector retrieval одной memory feature. Любая не доказанная memory разновидность должна оставаться за пределами обязательного Core behavior.

## 4. Tools

### Как текущая ставка может оказаться ошибочной

Typed tools NexusCLI выглядят переносимыми. Но вокруг них существуют legacy regex actions, cloud connector loop, shell/filesystem helpers MiniCursor и Minecraft-specific operations. Общий registry может скрыть разные уровни доверия.

### Скрытая сложность

- Schema validation не предотвращает вредный, но формально корректный вызов.
- Permission decision должна учитывать tool, target, path, network, user intent и provenance, а не только имя.
- Retry и recovery требуют idempotency или компенсации.
- Tool output может содержать prompt injection, секреты или слишком большой объём данных.
- Поддержка subprocess, connector и in-process tool не может иметь одинаковые timeout/kill semantics.

### Технический долг

- Legacy text-to-action paths остаются опасным fallback.
- Разные tool result/error formats усложняют UI и verification.
- Capability/approval audit может не совпасть с фактическим side effect.
- Нет доказанного contract test набора между providers, executor и clients.

### Что может сломаться через 6 месяцев

Новый tool будет работать из CLI, но не из Web UI. Повтор network timeout создаст duplicate side effect. Большой output заполнит context и storage. Изменение permission default даст silent security regression.

### Что кажется простым, но сложнее

«Добавить file tool» требует path policy, symlink rules, encoding, atomicity, cancellation, audit, diff/evidence и recovery.

### Что нужно упростить

Нельзя принимать arbitrary plugins, shell, browser, connector и game actions как равноправные v1.0 tools. Чем шире tool surface, тем меньше реально проверяемая security boundary.

## 5. Runtime

### Как текущая ставка может оказаться ошибочной

Выбор Bun или Node может выглядеть технической деталью. На деле это выбор storage driver, process/stream APIs, package manager, native modules, test environment and release operations.

### Скрытая сложность

- `bun:sqlite` и `node:sqlite` не являются автоматически взаимозаменяемыми.
- Local models, tools, Minecraft JVM и web server предъявляют разные process requirements.
- Windows-first assumptions не переносятся на Linux/macOS без отдельного поведения.
- Runtime updates могут менять module resolution и native binary compatibility.
- Разные команды запуска создают разные config/session roots.

### Технический долг

- Два активных runtime ecosystems.
- Смешанные scripts, lockfiles и package links.
- Неявные environment variables и filesystem locations.
- Отсутствие доказанной clean install/reproducible build для объединённой системы.

### Что может сломаться через 6 месяцев

CI будет проходить в одном runtime, а пользовательская установка — падать из-за native dependency. SQLite behavior изменится на другой версии runtime. Background process останется после обновления. Local model backend будет работать только в исходном CUDA окружении.

### Что кажется простым, но сложнее

«Заменить Bun на Node» или наоборот — не mechanical import change, а migration of runtime contract.

### Что нужно упростить

Нельзя поддерживать оба runtime равноправными в Core без доказанной cost model и contract tests. Нельзя маскировать platform-specific process behavior общей строкой `run()`.

## 6. Storage

### Как текущая ставка может оказаться ошибочной

SQLite кажется естественной общей основой, поскольку она используется в NexusCLI и Axiom. Но их schemas, migration history and transaction boundaries разные; Minecraft stores JSON, cloud — server database.

### Скрытая сложность

- Нужны ownership, IDs, ordering, optimistic concurrency и recovery semantics, а не только tables.
- Большой JSON session мешает частичному восстановлению и миграции.
- Multi-process writes Minecraft не защищены полноценным lock/schema strategy.
- Migration failures нельзя исправить простым повторным запуском без backup/rollback.
- Files, secrets, logs и binary/model artifacts не должны автоматически жить в одной БД.

### Технический долг

- Несколько непересекающихся schema versions.
- JSON corruption paths, где empty выглядит как отсутствующее состояние.
- Абсолютные paths в Minecraft instances.
- Неясная политика backups, repair and deletion.

### Что может сломаться через 6 месяцев

Старый store будет невозможно импортировать без потери history. Два процесса перезапишут state. Migration остановится на частично изменённой схеме. Storage size и vacuum начнут влиять на latency AgentLoop.

### Что кажется простым, но сложнее

«Свести две SQLite schemas» — это определение совместимой семантики данных и длительный migration contract, а не объединение migration files.

### Что нужно упростить

Нельзя обещать единый store, пока не определены минимальные entities и data ownership. Не следует скрывать domain JSON behind a “universal storage” interface без corruption and migration semantics.

## 7. Local Models

### Как текущая ставка может оказаться ошибочной

MiniCursor показывает локальный GGUF/llama.cpp путь, Axiom и NexusCLI — remote OpenAI-compatible providers, cloud — registry and connectors. Это не взаимозаменяемые model backends.

### Скрытая сложность

- Context limits, tool calling, streaming and structured output differ by model.
- CUDA, native binaries, quantization and VRAM make local runtime hardware-dependent.
- Model discovery is not model health; a listed model may not load or fit memory.
- Training artifacts, inference weights and provider credentials have different lifecycle.
- Provider error and cancellation semantics affect AgentLoop correctness.

### Технический долг

- Unresolved MiniCursor thinking contract (24 pass, 4 fail selected tests).
- Local model configuration is tied to Windows/CUDA assumptions.
- Multiple provider registries and capability vocabularies.
- No common evidence that tool calls behave identically across providers.

### Что может сломаться через 6 месяцев

Обновление model file или llama.cpp изменит output format. A new local model will fit catalog but exceed VRAM. Agent will assume tool calling that backend does not support. Fallback between local/remote providers will alter context or privacy unexpectedly.

### Что кажется простым, но сложнее

«Добавить local model as provider» requires tokenizer/context accounting, streaming, cancellation, tool schema, resource limits, health and error mapping.

### Что нужно упростить

Нельзя считать training, local inference and remote provider routing одной capability. Не следует обещать provider interchangeability без capability tests.

## 8. Security

### Как текущая ставка может оказаться ошибочной

Наличие PermissionEngine, OAuth PKCE, HTTPS checks and redaction создаёт видимость закрытой security model. Но controls находятся в разных projects и закрывают разные угрозы. Некоторые критические controls являются permissive или не обязательными.

### Скрытая сложность

- Local single-user trust, cloud multi-tenant trust, downloaded plugin trust and Minecraft account trust нельзя объединить одной gate.
- Plaintext Minecraft tokens, nearby encryption keys, environment secrets and connector credentials have different compromise paths.
- Approval UI must correspond to the exact side effect, target and arguments.
- Update checksum without mandatory trusted signature does not prove publisher authenticity.
- Logs, evidence, model prompts and tool output can leak secrets.

### Технический долг

- Старый Nexus security check may record audit without blocking execution.
- Loopback origin checks are not public auth.
- Minecraft updater accepts missing external checksum.
- OAuth lifecycle, revocation and token expiry are not one consistent contract.
- Security tests focus on selected paths, not complete end-to-end authorization.

### Что может сломаться через 6 месяцев

Новый adapter silently bypasses existing permission check. A secret appears in evidence or model context. An update is tampered with between metadata and installer. A token remains after logout or in a backup. A plugin/connector expands local trust unexpectedly.

### Что кажется простым, но сложнее

«Добавить auth» не равно защитить local tools; «проверить hash» не равно доверять release; «проверить Host header» не равно аутентифицировать client.

### Что нужно упростить

Нельзя расширять attack surface быстрее, чем security evidence. Каждый новый tool/provider/client boundary увеличивает число trust relationships, которые v1.0 должна поддерживать.

## 9. Migration

### Как текущая ставка может оказаться ошибочной

План переносить лучшие части из нескольких проектов звучит экономно. Но “лучший компонент” обычно зависит от локальных types, runtime, tests, config paths и undocumented invariants. Копирование кода сохранит эти связи; переписывание потеряет поведение.

### Скрытая сложность

- Need to preserve user sessions, actions, settings, instances, accounts and model configs without importing unsafe defaults.
- Two Minecraft launcher copies have different fields and release behavior.
- Axiom workspace links and external paths are not portable evidence.
- Old Nexus compatibility aliases may still be used by hidden imports.
- Data migration can succeed syntactically and still change semantics or permissions.

### Технический долг

- No single canonical schema or version matrix.
- No proven rollback for combined migration.
- Historical tests are not contract tests across projects.
- Archive contains stale docs and unexamined ZIP snapshots.
- “Primary source” choices are audit recommendations, not release artifacts.

### Что может сломаться через 6 месяцев

Users lose session/evidence history; Minecraft instances point to invalid absolute paths; old configs select unsafe provider defaults; an adapter update breaks imported state; rollback leaves two stores with different truth.

### Что кажется простым, но сложнее

«Перенести только интерфейсы» может быть сложнее, чем код: hidden error, cancellation, ordering and security assumptions are often encoded in callers and tests.

### Что нужно упростить

Нельзя мигрировать всю историю сразу. Чем больше legacy paths обещают совместимость в первой версии, тем дольше сохраняется каждый старый defect and ambiguity.

## Cross-cutting failure modes

### 1. Ложный успех

AgentLoop, old Nexus runtime and UI can disagree about completion. If verification is weak or delayed, Nexus will report success while a tool, process or update is incomplete.

### 2. Расхождение источников истины

Session database, event stream, UI state, process table and JSON ledger can each claim a different status after retry or crash. Without one authoritative lifecycle, support cases become irreproducible.

### 3. Непреднамеренное расширение доверия

Adding a provider, connector, plugin, browser or Minecraft account can expose local files, secrets or network access through an existing generic tool path.

### 4. Неспособность откатиться

Schema, model, provider and updater changes can be individually reversible but jointly irreversible once evidence, files and credentials have changed.

### 5. Невозможность поддерживать систему

When Bun/Node, Python, React, PySide6, Electron, CUDA and cloud services are all treated as one product surface, every incident crosses several teams and environments. The system may remain demo-capable but operationally unmaintainable.

## Ответы на вопросы review

### 1. Какие архитектурные решения могут быть ошибочными?

- считать NexusCLI Agent Core автоматически совместимым с Axiom ChatCore;
- выбирать Bun или Node без полного runtime/storage/package cost analysis;
- делать SQLite одной общей схемой до определения entity ownership;
- объединять history, profile, context и retrieval в Memory;
- принимать единый Tool Protocol без разных trust levels;
- считать provider registry достаточным для local/remote/tool-capable models;
- считать event streaming transport-only задачей;
- считать Minecraft runtime/process abstractions универсальными;
- принимать security controls отдельных проектов за единый threat model;
- обещать переносимость legacy данных без rollback и semantic checks.

### 2. Где будет технический долг?

В adapter boundaries, duplicate schemas, runtime launchers, event translation, provider capability mapping, memory retention/deletion, process reconciliation, secret migration, old compatibility paths и тестах, которые проверяют только happy path.

### 3. Что может сломаться через 6 месяцев?

Восстановление после crash, большие sessions, duplicate side effects, provider streaming/tool calls, local model loading, SQLite migrations, credentials after logout, updater trust, Minecraft instance paths и CI/clean-install reproducibility.

### 4. Что кажется простым, но является сложным?

Подключить AgentLoop к UI; добавить tool; сохранить memory; объединить SQLite; сменить runtime; добавить local model; “защитить” loopback API; импортировать старые данные; проверить, что задача действительно завершена.

### 5. Что нужно упростить?

Уменьшить число обязательных режимов, runtimes, storage formats, trust boundaries и legacy compatibility promises, которые должны работать одновременно в v1.0. Это не предложение новых возможностей; это требование уменьшить количество вещей, которые могут отказать.

## Итог red-team

Текущий план провалится, если команда примет архитектурное сходство за совместимость и начнёт переносить модули до проверки contracts. Наиболее опасны не видимые TODO, а незаметные расхождения: одинаковое имя state при разной семантике, одинаковый provider interface при разных capabilities, одинаковый “memory” при разной privacy policy и одинаковый “success” без одинакового evidence.

Пока эти риски не закрыты доказательствами, Nexus следует считать набором сильных, но отдельных исторических компонентов, а не уже собранной системой.
