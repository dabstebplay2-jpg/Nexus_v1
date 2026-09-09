# Nexus v1.0 — Architecture Decision Records

Дата: 2026-09-09. Статус: **архитектурные решения этой миссии; реализация отсутствует**. Владелец: разработчик Nexus. Основание: E01–E18 из [Analysis Summary](C:/Nexus_History/NEXUS_ANALYSIS_SUMMARY.md). Числа старых тестов не являются приёмкой этих решений.

Нумерация соответствует текущей миссии. Она заменяет номера вопросов подготовительного Decision Register только в рамках настоящего набора ADR; старые документы остаются историческими.

## ADR-001 — Core boundary

**Problem:** одинаковые названия Core скрывают execution, chat, UI и доменные продукты.

**Options:** объединить проекты; generic platform; ограниченный modular monolith.

**Decision:** один TypeScript application с модулями task orchestration, context, tools/permissions, verification, storage, provider и process. Один CLI. Системные порты только для реально внешних эффектов: provider HTTP, persistence, filesystem/process. UI/Express, cloud, Minecraft, plugins и ML stack не входят в Core.

**Why:** E01 показывает готовую точку композиции; первый сценарий не требует распределённой системы.

**Rejected alternatives:** перенос OpenCode; Axiom+NexusCLI как два сервиса; универсальный plugin SDK.

**Tradeoffs:** один активный run во всём экземпляре Nexus; меньше reuse API обещаний. Внутренние модули могут изменяться вместе.

**Acceptance:** импорт Core не запускает UI/сервер; один процесс и одна точка композиции; dependency check исключает архивные products.

## ADR-002 — Host Runtime

**Problem:** Bun APIs NexusCLI и node:sqlite Axiom несовместимы на уровне существующих adapters (E07–E14).

**Options:** Node с переносом executor/storage; Bun с выборочной адаптацией Axiom; два равноправных runtime.

**Decision:** TypeScript + **Bun**, Windows x64 как единственная поддержанная среда v1.0. Начальная версия для квалификации — 1.3.14 из собственного package.json NexusCLI; перед release закрепить ровно прошедшую проверки версию. Не заявлять её актуальность/безопасность без release review. Не использовать node:sqlite в поставке.

**Why:** сохраняется наиболее сложный проверяемый execution path; Node потребовал бы смены SQLite и process implementations прежде первого результата.

**Rejected alternatives:** dual-runtime Core; полная поддержка Linux/macOS; Python как host.

**Tradeoffs:** Bun-specific process/SQLite остаются технической зависимостью. При провале Windows gates ADR пересматривается до переноса; Node — альтернатива, не параллельная реализация.

**Acceptance:** clean install, typecheck, process cancellation/recovery и SQLite fault suite на pinned runtime. Внешний inference process не является вторым host runtime Nexus.

## ADR-003 — Agent lifecycle

**Problem:** AgentSession смешивает долгий диалог, task и попытку; старый COMPLETED можно продолжить (E10).

**Options:** перенести старые статусы дословно; generic workflow engine; малый run lifecycle.

**Decision:** адаптировать NexusCLI AgentLoop. Session — контейнер диалога; Task — неизменяемая ограниченная цель/критерий; Run — одна последовательная попытка. Run: CREATED → ACTIVE ↔ WAITING_APPROVAL → VERIFYING → SUCCEEDED/FAILED/CANCELLED/UNKNOWN. Части baseline/context/model отражаются phase/event, не десятками статусов. Terminal run неизменяем; явный retry создаёт новый run. UNKNOWN запрещает новый mutating run до reconciliation.

**Why:** сохраняется ответственность executor и completion policy, исчезает переписывание истории успеха.

**Rejected alternatives:** multi-agent; durable generic job scheduler; автоматический повтор uncertain actions.

**Tradeoffs:** cancellation до side effect — CANCELLED; при неопределённом эффекте — UNKNOWN даже после просьбы отменить. Отказ approval — CANCELLED(reason=declined), не failure модели.

**Acceptance:** переходы, terminal immutability, rejection of concurrent runs, recovery без повторного spawn/write.

## ADR-004 — Chat vs Agent separation

**Problem:** сообщение чата и доказанный результат изменения — разные утверждения.

**Options:** два полноценных engines; tools во всех диалогах; один task UI с informational replies.

**Decision:** CLI поддерживает сообщения/уточнения в task session. Informational reply не имеет прав tools и не порождает SUCCEEDED для task. Полный Axiom ChatCore с edit/retry conversation и Web UI откладывается; переносятся правила complete-turn context и сохранения прерванной генерации.

**Why:** граница сохраняется без поддержки второго продукта до релиза.

**Rejected alternatives:** считать answer mode coding completion; расширять Axiom до второго executor.

**Tradeoffs:** standalone chat features не входят в release gate.

**Acceptance:** текст «готово» без trusted verification не меняет task outcome.

## ADR-005 — Tool protocol

**Problem:** regex actions и произвольные команды делают effects непредсказуемыми.

**Options:** legacy text execution; generic shell tools; закрытый typed набор.

**Decision:** статические tools `list_files`, `read_file`, `propose_patch`, `apply_patch`, `run_check`. Patch — один существующий разрешённый source-файл в slice. `run_check(checkId)` разрешает только пользовательски утверждённый argv, не произвольную строку модели. Contract содержит schemaVersion, implementationVersion, actionId, validated input, risk/effect, target/precondition, budget и typed result. Модель не задаёт evidence verdict.

**Why:** E05/E11 дают основу, но список builtins нужно уменьшить.

**Rejected alternatives:** MCP/plugin ecosystem, shell parsing, install packages, delete, git mutation, model-generated commands.

**Tradeoffs:** меньше задач; новый tool требует отдельной проверки permission, recovery и verifier.

**Acceptance:** invalid schema/unknown tool → zero execution; incomplete provider calls не попадают в executor.

## ADR-006 — Permission model

**Problem:** WRITE_PROJECT=allow нарушает MVP; approval без идентичности аргументов допускает подмену (E04).

**Options:** доверять плану; allow session-wide writes; approve конкретный action.

**Decision:** READ allow только после выбора workspace и списка допустимых данных; WRITE и RUN_CHECK ask каждый раз; остальные effects deny. Approval одноразовое, привязано к actionId, tool version, task contract revision, workspace identity, canonical input digest, beforeHash и patch digest либо check argv/executable/harness hashes. Любое изменение аннулирует approval. Отсутствие интерактивного ответа никогда не означает allow.

**Why:** план — предложение модели, не пользовательское разрешение.

**Rejected alternatives:** regex command classifier как security policy; persistent «allow all»; reuse approval после restart.

**Tradeoffs:** несколько подтверждений, включая baseline и final check. Возможность batch approval не входит в v1.0.

**Acceptance:** deny, stale file, modified argv, replay approval, restart while waiting — no unauthorized effect.

## ADR-007 — Verification system

**Problem:** успешный exit code и regex пользовательской цели недостаточны (E02/E03).

**Options:** модель/verifier-model; manual assertion; frozen deterministic goal check.

**Decision:** задача допускается с выбранным пользователем check и acceptance contract: воспроизвести указанное падение до patch; неизменяемые тест/runner/config; после patch тот же check должен выполнить ожидаемый тест и пройти; scope diff должен совпасть с approval. Evidence включает contract revision, input/output fingerprints, test identity/count или fixture-specific failure/pass marker, exit code и output completeness. Лишь CompletionPolicy пишет SUCCEEDED.

**Why:** fail→pass при неизменной проверке даёт ограниченное, но проверяемое утверждение.

**Rejected alternatives:** build-only success; отсутствие выполненных tests; ручной assertGoal как замена slice verification; изменение теста моделью; произвольная новая проверка после patch.

**Tradeoffs:** не доказывает общую правильность программы; first runner profile ограничен. Тестирование проекта остаётся trusted-code execution.

**Acceptance:** baseline already-pass/не тот тест/0 tests/changed harness/stale evidence → no success; источник ошибки должен быть test assertion, а не missing dependency.

## ADR-008 — Event system

**Problem:** snapshots, callbacks и UI stream не являются единым источником outcome.

**Options:** message broker/event sourcing; HTTP stream; SQL events + local observer.

**Decision:** SQLite state — authority. State transition и durable lifecycle event сохраняются одной транзакцией. Envelope: version, eventId, monotonic seq, taskId/runId/actionId?, timestamp, type, sanitized payload. CLI читает committed события и snapshot; observer failure не откатывает action и не запускает retry. Token deltas ephemeral, не evidence; их потеря допустима. Replay по seq, дедупликация по eventId.

**Why:** E10 уже реализует часть паттерна; broker не нужен.

**Rejected alternatives:** event sourcing всех данных, Kafka/Redis, обязательный HTTP/WebSocket server.

**Tradeoffs:** contract внутренний, не public SDK; live token UI не release blocker.

**Acceptance:** crash между commit и render не теряет outcome; повтор render не дублирует действие.

## ADR-009 — Storage ownership

**Problem:** две истории migrations и dual session/message truth создают расхождения.

**Options:** склейка старых DB; JSON ledger; одна новая SQLite schema.

**Decision:** один локальный SQLite-файл вне workspace, один мигратор, WAL/FULL/FK, bounded payloads. Раздельные таблицы session/task/run/message/action/approval/check/evidence/event; history не дублируется в session JSON. Task state и evidence транзакционно связаны. Межпроцессный эксклюзивный lock в одном canonical dataDir до открытия mutating API; второй CLI отказывает, кроме read-only inspection согласованного snapshot.

**Why:** сохраняются SQL primitives E09, но не историческая схема целиком.

**Rejected alternatives:** два мигратора; cloud DB; generic repository для каждого будущего продукта; lease по одному PID.

**Tradeoffs:** один активный экземпляр; не поддерживаются несколько dataDir над одним workspace, сетевые FS и совместное редактирование. SQLite/FS не атомарны между собой — intent+reconcile.

**Acceptance:** migration failure rollback; consistent backup; future schema rejects; corrupt DB opens diagnostic/read-only mode; no silent reset.

## ADR-010 — Memory architecture

**Problem:** profile, transcript, cache и RAG смешаны в подготовке.

**Options:** universal Memory service; profile/RAG; session transcript + bounded context.

**Decision:** только durable transcript текущей session и контекст текущего task. Context builder включает immutable policy, task contract, tool schemas, выбранные файлы и полные tool exchanges с provenance. Budget checks до HTTP; ответ модели/файлы — untrusted data. Удаление старых целых turns допустимо, обязательные constraints не сокращаются; если они не помещаются — явная ошибка.

**Why:** достаточно slice; правила Axiom полезнее переноса cloud memory.

**Rejected alternatives:** vector store, auto-learn profiles, cross-session memory, второй LLM summarizer.

**Tradeoffs:** отсутствие долговременной персонализации; history удаляется только явной локальной операцией обслуживания, без обещания secure erase SQLite/backups.

**Acceptance:** сохранены call/result pairs, политика и check contract; секретные paths исключены; context overflow не запускает tools.

## ADR-011 — Model provider system

**Problem:** mock не доказывает продукт; cloud dependency запрещена; local ML runtime слишком дорог для Core.

**Options:** обязательный remote API; встроенный MiniCursor; пользовательский local endpoint.

**Decision:** один OpenAI-compatible adapter по образцу NexusCLI и deterministic mock. Реальный release сценарий — пользовательский локальный HTTP endpoint с подтверждёнными text/tool-call capabilities. Nexus не устанавливает и не управляет inference server. Remote HTTPS endpoint — только явная настройка и согласие на отправку выбранного контекста, не условие работы. Конкретная модель/server/hardware фиксируются в qualification report до релиза.

**Why:** Core и state local-first, облако не обязательно, Python/GPU не входят в host.

**Rejected alternatives:** автоматический local→cloud fallback; model routing; встраивание training; считать /models проверкой capabilities.

**Tradeoffs:** автономность установки модели не обещается. Реальная модель остаётся открытым qualification blocker, а не имитируется mock.

**Acceptance:** offline live fail→patch→pass на выбранной модели; schema/stream/cancellation tests; unsupported tools capability → отказ до run.

## ADR-012 — Runtime/process management

**Problem:** spawn/kill и PID не гарантируют известный результат после crash.

**Options:** generic supervisor; фоновые jobs; один foreground check runner.

**Decision:** только foreground frozen checks, direct executable + argv без shell; sanitized allowlist env; cwd фиксирован. До spawn durable intent, затем PID+creation identity если доступна, deadline и observed exit/output. Process tree termination при cancel — best effort с подтверждением результата. Если identity/exit/cleanup не доказаны — UNKNOWN; автоматический respawn и kill чужого PID запрещены.

**Why:** E07 полезен, но не является persistent supervisor. Minecraft даёт требования, не код для переноса.

**Rejected alternatives:** general jobs/download manager, daemon, перезапуск неизвестной команды, PID-only kill после restart.

**Tradeoffs:** Windows process-tree spike — foundation gate. До его прохождения нельзя заявлять cancellation guarantees. Поддерживаются доверенные runner-ы без detached children.

**Acceptance:** parent crash/spawn window/PID reuse/orphan fixtures; uncertainty блокирует следующие mutations, пока пользователь не подтвердит диагностику и процесс не урегулирован.

## ADR-013 — Security model

**Problem:** permission/path checks не изолируют исполняемый код и не обнаруживают все secrets.

**Options:** hostile-repository sandbox; доверять всем; explicit trusted-workspace MVP.

**Decision:** один пользователь, локальный диск, доверенный и просмотренный им небольшой repo, без конкурентного изменения. Модель/файлы/ответы tools недоверенные для управления. Allowlisted paths и checks enforced приложением; исполнение tests с правами пользователя не sandbox. Непроверенные репозитории не запускаются. Secrets: Nexus не сохраняет credentials; env reference или ввод в память процесса, не argv. Child env — минимальный allowlist, ключи provider никогда не наследуются. Redaction known values/patterns до storage/UI/request; arbitrary secrets не гарантированно распознаются.

**Why:** честно ограничивает возможные гарантии одному разработчику.

**Rejected alternatives:** перенос plaintext Minecraft tokens, Axiom master.key+secrets как vault, regex как sandbox, автоматизация hostile repo.

**Tradeoffs:** нет OS vault/OAuth в v1.0; same-user malware, администратор, malicious trusted tests и disk forensics вне защиты. До передачи контекста пользователь доверяет выбранным файлам/endpoint.

**Acceptance:** denied actions zero effects; hardlinks/junctions/ADS blocked у writable targets; secret sentinels не обнаруживаются в child env/context/log/state. Documented guarantees ограничены приложением, не всем кодом тестов.

## ADR-014 — Migration strategy

**Problem:** copying donor code приносит contracts и дефекты одновременно.

**Options:** whole-tree merge; full rewrite; contracts-first selective adaptation.

**Decision:** адаптировать NexusCLI loop/executor/CLI/provider и проверочные идеи, заменить несовместимые policy/schema. Из Axiom брать context/migration/abort test scenarios и model identity; UI/Express/DB driver не переносить в v1.0. Minecraft/MiniCursor — только требования/идеи, без обязательных adapters. Old Nexus и Maker не включать. Новая DB начинается пустой; legacy import не release blocker.

**Why:** сохраняет сложное подтверждённое поведение и уменьшает число dependencies.

**Rejected alternatives:** historical DB merge, generic wrappers «на будущее», миграция всех пользователей без inventory.

**Tradeoffs:** старую историю читают исходными средствами; import может стать отдельной задачей. Архив не удаляется и не переименовывается.

**Acceptance:** source provenance, notices, donor tests mapped to new contracts, no references to absolute archive paths; rollback новой версии не трогает старые stores.

## ADR-015 — API/client and repository

**Problem:** публичный API/второй UI увеличивают обязательную матрицу.

**Options:** Axiom Web first; CLI+HTTP; CLI in-process.

**Decision:** один package, `src` с внутренними модулями, `apps/cli`, `test`, `docs`; создавать только в следующей задаче. In-process application API: createTask, run, approve/deny, cancel, inspect, reconcile, listSessions. CLI не обращается к DB и provider напрямую. Никакого listening port Core.

**Why:** минимум поставки для одного разработчика.

**Rejected alternatives:** multi-package monorepo сейчас; public SDK; перенос всего React frontend.

**Tradeoffs:** Axiom UI отложен; внутренние API не обещают внешнюю обратную совместимость.

**Acceptance:** одна команда для каждого run/test/doctor operation; зависимости не требуют frontend build.

## ADR-016 — Qualification, metrics and update

**Problem:** mock 100% и произвольные latency targets не доказывают полезность; нужен обслуживаемый release.

**Options:** выпустить после unit tests; broad benchmark; ограниченный corpus + live qualification.

**Decision:** frozen acceptance fixtures с внешним oracle; обязательные negative/crash/security gates; отдельный live local model report. Числа из Success Metrics — начальные target budgets, до измерений не факты. Каждое изменение порога — документированное решение до итогового замера. Manual update из проверенного release artifact, consistent DB backup до migration; нет auto-updater. Rollback восстанавливает binary+matching backup после остановки процессов, не запускает old binary над новой schema.

**Why:** достаточно объективности без нового telemetry сервиса.

**Rejected alternatives:** «прошёл fixture = production-ready», живой provider в каждом unit test, автоматический updater ради MVP.

**Tradeoffs:** ручная квалификация модели и Windows обязательна; неизвестная пригодность не превращается в принятую гарантию.

**Acceptance:** release checklist из Roadmap; результаты привязаны к commit/runtime/hardware/model/corpus; открытые критические blockers запрещают v1.0.
