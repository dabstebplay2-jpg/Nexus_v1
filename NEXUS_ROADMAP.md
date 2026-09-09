# Nexus v1.0 — Implementation Roadmap

Дата: 2026-09-09. План реализации для одного разработчика; никаких работ по коду в этой миссии не выполнено. Основание: [ADR](C:/Nexus_History/NEXUS_ADR.md), [Architecture](C:/Nexus_History/NEXUS_V1_ARCHITECTURE.md), [Migration Plan](C:/Nexus_History/NEXUS_MIGRATION_PLAN.md).

## Граница релиза и порядок

**Nexus v1.0 выпускается после Phase 0 + Phase 1 и прохождения release gates.** Phase 2, 3 и 4 — после релиза, не prerequisites. В частности, «More tools» и «More providers» не повод откладывать первый законченный продукт. Фазы здесь — implementation roadmap, не фазы подготовки архитектурных документов в задании.

Один разработчик ведёт одну цель до acceptance. Оценки ниже — planning ranges при целевой работе, не обещание сроков: Phase 0 около 1–2 недель; Phase 1 около 3–6 недель с резервом на process/model qualification. После Foundation диапазон пересчитывается по фактической скорости. Нельзя сократить security gates ради даты; сокращать нужно scope.

## Phase 0 — Foundation

**Goal:** доказать техническую осуществимость одного безопасного локального исполнения до объединения Agent/UI.

**Components:**

- Один package/CLI composition, закреплённый Bun/Windows target, reproducible lockfile; создавать в отдельной implementation task.
- Domain contracts: Task, Run, Action, Check, Approval, Evidence, Event; canonical glossary.
- Один SQLite store и мигратор, consistent backup/restore, OS writer lock и row versions.
- File guard/patch preconditions и foreground frozen check runner.
- Minimal in-process API, typed error taxonomy, fake provider.
- Credentials только env-reference/in-memory; bounded context/output и child env allowlist.

**Tests:**

1. Run/action transitions, terminal immutability, second-writer rejection.
2. State+event atomicity и crash после commit до render.
3. Approval digest/replay/stale target/deny matrix.
4. File traversal, junction, symlink, hardlink, stale hash, approved patch boundaries.
5. Windows spawn failure, timeout, cancellation, child/grandchild, PID reuse и spawn/record crash gap.
6. DB full, future schema, corrupt DB diagnostics, migration rollback и consistent backup restore.
7. Child env/argv/output secret sentinels; provider не требуется.

**Acceptance criteria:**

- Никакой negative test не вызывает unauthorized effect или false success.
- Неподтверждённый effect остаётся UNKNOWN и запрещает следующий mutating run; нет auto-spawn/replay.
- Writer locking не основан только на PID и не допускает двух процессов.
- Process limitations и trusted-repo scope описаны и воспроизведены.
- Clean mock environment не требует Axiom UI, Python, CUDA, cloud, Minecraft или parent OpenCode.
- Foundation blockers закрыты evidence либо ADR пересмотрен до дальнейшего переноса. Нельзя просто обернуть неработающий process path generic adapter-ом.

**Exit artifact:** результаты tests с commit/runtime/OS, contracts и короткий install/run/diagnose runbook. Это техническая основа, ещё не продуктовый успех.

## Phase 1 — Vertical Slice → v1.0

**Goal:** пользователь формулирует ограниченную repair task, Nexus воспроизводит её failing check, предлагает один patch, запрашивает approval, применяет его и подтверждает результат неизменной проверкой.

**Components:** адаптированный NexusCLI AgentLoop/executor/verifier/provider/CLI, Axiom context/migration правила, новая минимальная schema. Один local model endpoint пользователя с подтверждённым tool-call contract. Никакого model server manager.

**Последовательность работ:**

1. Frozen fixture и внешний test oracle. Первый fixture — Bun/TypeScript add со сломанным выражением, неизменяемым test case и разрешённым одним source-файлом.
2. Baseline verifier до patch: отличать assertion failure от setup failure и zero tests.
3. Полный mock-provider flow с реальными filesystem/check effects; approvals показывают полный bounded diff и exact argv.
4. Provider contract tests с локальным HTTP stub: stream/non-stream, fragments, incomplete calls, timeouts, invalid JSON и retry.
5. Выбрать и записать один реально доступный local endpoint/model/hardware; проверить offline structured calls. Если не проходит — qualification blocker, не основание требовать cloud.
6. Реальный live-provider fail→patch→pass; никакого hardcoded fix внутри agent path.
7. Red-team regression, clean install, update/restore drill, измерения и release checklist.

**Tests:**

- E2E request→session/task/run→context→model→plan→tools→approval→execution→verification→evidence→result.
- Malformed plan/tool calls; «готово» без evidence; model пытается изменить check/test; old fingerprint; zero tests; baseline already-pass; test изменяет source.
- Approval declined, cancellation до/после effect, interrupted model turn, lost exit, observer exception, storage failure и duplicate invocation.
- Restart после каждого критического перехода; terminal result не меняется; retry — новый run.
- Redaction по известным values/patterns, context pairs/budget, no secret child env.

**Acceptance criteria:**

1. Все mandatory deterministic assertions проходят; не менее 20 повторов основного fixture без расхождения outcome и без unexpected effects. Это repeatability, не оценка вероятности успеха любых задач.
2. 0 false completion и 0 unauthorized effects на frozen negative corpus. Любое нарушение блокирует выпуск.
3. Отдельный live qualification corpus минимум 5 небольших вариантов того же repair сценария: source typo/operator/boundary, неизменный подход проверки, один writable file. Для каждого записаны model/runtime/hardware, input, outcome и evidence; нет скрытых ручных edits. Все выбранные supported acceptance cases должны дать доказанный success; ошибки вне supported cases публикуются отдельно, не удаляются из отчёта.
4. Локальный endpoint проходит offline run; mock никогда не подменяет live proof. Размер/VRAM/установка inference server указаны как пользовательская внешняя prerequisite.
5. Read/write/process support boundaries и residual risks RT-04/05/07/09 явны; система не заявляет sandbox или универсальную secret detection.
6. Install/run/test/inspect/diagnose/update/restore доступны одному разработчику по документации; никакой операции не нужны скрытые archive junctions.
7. Все observables F/R/S/D из прежнего DoD покрыты с уточнениями ниже; критические gaps не закрываются текстом отчёта.

### Traceability релизных проверок

| Gate | Проверяет | Источник / критерии |
|---|---|---|
| G1 | Сквозной task + точная verification | DoD F-01–09; RT-01/02; baseline/final case, diff, revision |
| G2 | Permission и protected targets | DoD F-06, S-01–03/S-06; RT-03/05 |
| G3 | Recovery/uncertainty/terminal history | DoD R-01–09; RT-06/07/08/11 |
| G4 | Secrets/context/trust boundary | DoD F-03, S-04–08; RT-04/09; known sentinels, trusted-code limitation |
| G5 | Реальная модель без cloud prerequisite | ADR-011; RT-10; отдельно от deterministic mocks |
| G6 | Install/test/debug/update | DoD D-01–09; clean machine report, documented prerequisites |
| G7 | Scope и dependencies | DoD F-10; один CLI/runtime/store, нет excluded products |
| G8 | Performance/state bound | Success Metrics P-01–08, M-01–08; измеренная среда и полный отчёт |

### Qualification численных метрик

Начальные target budgets из Success Metrics сохраняются для первого замера: startup median≤3s/p95≤5s; admission median≤500ms/p95≤1s; local orchestration median≤500ms/p95≤2s; persistence median≤100ms/p95≤500ms; state стандартного run≤5MiB; mock suite median≤60s/p95≤3min. Записать размер repo, аппаратную среду, n≥20 и raw observations. Это targets, не уже подтверждённые возможности.

Честно отделять provider inference, user approval wait и test runtime от overhead Core. Для live provider нет выдуманного универсального SLA. При превышении бюджетов сначала найти источник; изменение target обосновать и версионировать до повторного итогового замера, не скрывать regression. Operation/context/output limits проверяются всегда, независимо от performance targets.

Install≤30min, diagnosis≤15min, recovery drill≤30min измеряются на документированной поддержанной среде. Install mock path не включает многогигабайтную загрузку пользовательской модели: live-model setup time записывается отдельно. «100% recovery» означает правильное сохранение/классификацию случая, включая UNKNOWN; не обязательное автономное продолжение.

### Уточнения прежнего DoD, принятые ADR

- CANCELLED — отдельный известный итог; UNKNOWN не подменяет каждый отказ пользователя.
- Один Task может иметь несколько terminal Runs, старый run не переоткрывается.
- Credential values не сохраняются Nexus; env/in-memory достаточно MVP без нового vault.
- Произвольная порча диска не гарантирует zero data loss; backup restore имеет явный loss interval и reconciliation.
- Рабочая область защищена для Nexus file tools; approved trusted test code выполняется с правами пользователя.
- События клиента не могут менять committed outcome; token streaming не release prerequisite.
- Test artifacts допускаются только в объявленной области; model-writable test harness запрещён.

**Exit artifact:** versioned release candidate, локальные acceptance reports, live-model qualification, sanitized diagnostic sample, installation/update instructions и подписанный разработчиком checklist. Код для этого создаётся в следующей фазе работ; здесь только план.

## Phase 2 — More tools (после v1.0)

**Goal:** расширить закрытый набор только для конкретной повторяющейся задачи пользователя, если v1.0 уже полезна.

**Components:** один новый statically registered tool за теми же permission/executor/evidence boundaries. Новые package managers, shell, browser, plugins и cloud не включаются автоматически.

**Tests:** input/risk policy, exact approval, stale target, output bounds, timeout, interrupted effect, replay, verification adequacy; весь Phase 1 corpus без регрессий.

**Acceptance criteria:** измеримая польза в одном новом supported case; нет расширения trust model без отдельного ADR; один разработчик способен диагностировать tool. Если безопасный result невозможно проверить — tool откладывается.

## Phase 3 — More providers (после v1.0)

**Goal:** ещё один endpoint/provider variant только при реальной потребности, без изменения client/executor.

**Components:** дополнительный статический provider adapter либо новый qualification profile существующего; capabilities и явная configuration. MiniCursor допустим как внешний endpoint, не встроенный CUDA installer/training stack.

**Tests:** те же protocol/stream/partial/cancel/retry fixtures; tool-call capabilities; no silent remote fallback; context/token limits; одинаковый verification corpus.

**Acceptance criteria:** provider не может менять permissions/evidence producer; заявленные capabilities подтверждены live, costs/privacy documented; нет compulsory cloud. Несовместимый tool format — отказ или отдельный adapter, не эвристическое исполнение текста.

## Phase 4 — Future expansion (отдельная миссия)

**Goal:** пересмотреть продуктовые потребности после реального использования. Это gate для новых решений, не обязательство реализовать parked ideas.

**Components:** пока не определены. Возможный второй клиент Axiom обсуждается раньше распределённой системы; не переносить Web UI автоматически. Minecraft/Maker/Studio/IDE/browser/teams/plugins/multi-agent/training остаются самостоятельными решениями.

**Tests:** согласуются только после нового scope/ADR; existing v1.0 regression suite обязателен.

**Acceptance criteria:** есть конкретная потребность, owner, бюджет поддержки, threat model и критерий отказа. Нет feature только ради «платформенности». Future expansion не меняет опубликованное поведение v1.0 задним числом.

## Stop / revise rules для реализации

Остановить расширение, если нет доказанного fail→pass, Windows process/lock semantics не квалифицированы, local provider не выполняет tools или данные теряются незаметно. Пересматривать конкретный ADR и уменьшать scope. Не добавлять HTTP server, generic jobs или второй runtime как обход незакрытого Foundation риска.

Эта миссия завершена документацией. Реализация, создание нового репозитория, перенос кода и установка зависимостей требуют отдельного задания.
