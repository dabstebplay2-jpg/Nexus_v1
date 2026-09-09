# Nexus v1.0 — Migration Plan

Дата: 2026-09-09. Основание: ADR-001–016 и финальная V1 Architecture. Статус: план будущей работы; ничего не перенесено, не удалено, новый проект не создан. «Удаляется» ниже означает исключается из новой поставки, архив сохраняется.

## Правило переноса

Contracts first → negative acceptance fixtures → выбор donor → адаптация → regression/contract tests → интеграция в vertical slice. Не запускать исторические миграторы над общей DB. Не адаптировать новый Core под старые JSON просто ради совместимости.

Каждая единица переноса получает запись provenance: source path, hash/commit если доступен, notices/license, назначение, изменённые invariants, mapped tests. Архивный node_modules, абсолютные ссылки, пользовательские БД, секреты и caches не входят в перенос. Право использования стороннего кода проверяется до его включения; это gate provenance, не предположение о лицензии parent tree.

## Матрица переноса

| Источник | Что переносится | Что адаптируется / меняется | Что остаётся отдельно / исключено | Gate |
|---|---|---|---|---|
| NexusCLI/nexus composition, API, AgentLoop | Последовательный loop, bounded execution, typed ошибки, идея одной composition root | Разделение session/task/run; terminal immutable; один активный run | Parent OpenCode, альтернативные loops, параллельные агенты | lifecycle/restart tests |
| NexusCLI tools/registry/executor | schema validation, intent-before-effect, action/evidence transaction | Закрыть tools до read/list/patch/check; approval binding; action state machine | generic shell, install, git mutate, delete, regex implicit actions | invalid input/replay/deny tests |
| NexusCLI permissions/engine | Явные capability decisions и ask/deny flow | WRITE ask, one-shot exact args/preconditions; default deny unsupported | WRITE_PROJECT allow, regex command security classifier | stale approval test |
| NexusCLI completion/verification | Evidence provenance, fingerprints/revision, central completion decision | Обязательный baseline failure без regex; same case final pass; protected harness; immutable run | Manual assertGoal как automated success; auto-run всех detected checks | false completion corpus |
| NexusCLI recovery | Inspect-only uncertain actions, before/after hash idea | Targeted patch observation вместо общего package inventory; no blind replay | PID-only assumptions, terminal session reopen | crash injection |
| NexusCLI storage | WAL/FULL/FK, transaction и optimistic version techniques | Новая schema/lifecycle ownership; OS writer lock; no duplicated transcript | Старые migration v1 и DB import, session giant JSON projection | new schema/backup/restore |
| NexusCLI llm | Tool-call fragments, finish reason validation, bounded HTTP retry | One local endpoint capability contract, size/deadline limits, redaction | Routing/fallback, automatic remote use | local HTTP fixture tests + live qualification |
| NexusCLI process/workspace | Bounded output, argv execution, path/secret guards | env allowlist, frozen executable, identity/cleanup, hardlinks и race limits | arbitrary process manager, blacklisted env как единственная защита | Windows spike |
| NexusCLI CLI | Основной пользовательский flow, inspect/sessions/diagnostics идеи | Full bounded diff/command approval, task/run terminology, honest unknown | Команды неподдержанных tools, весь OpenCode CLI/TUI | CLI acceptance |
| Axiom core/context/chat tests | Полные conversation turns, context overflow до записи, aborted partial generation | Перенести правила/сценарии в Bun target; no second engine | Полный ChatCore feature set, edit/retry conversation UI | context/protocol tests |
| Axiom storage migrations tests | Версионирование, rollback, interrupted-state cases | Тестировать новую единую schema на bun:sqlite | node:sqlite adapter, Axiom DB, encrypted-file master.key backend | migration failure/restore tests |
| Axiom registry/shared | connectionId/modelId separation, capabilities unknown semantics | Минимальная configuration одного endpoint; explicit supported tools | Model catalog UI, provider marketplace, factory framework без variation | provider capability gates |
| Axiom UI/API | Ничего обязательного до v1.0 | Сохранить как future client reference | React/Express/NDJSON listener не входят в release | отдельная задача после релиза |
| Minecraft concepts | Требования к process lifecycle, unknown state, прогрессу, env detection | Перевести выявленные сбои в process fixtures; минимум preflight executable | Весь Python/PySide6, downloads/version/instance framework, accounts/loaders/Modrinth/updater | проверены требования, не Python migration |
| MiniCursor concepts | Предварительная capability/availability диагностика local endpoint | Documented boundary внешнего inference процесса | CUDA/ML packages, training, JSON memory, agent/router | реальный endpoint qualified отдельно |
| Old Nexus | Отдельные negative/regression сценарии false completion/security bypass | Переформулировать как тесты новых contracts | Runtime/CLI/VectorMemory/Database и legacy aliases не включаются | нет runtime imports |
| Maker, AI Site, no-code, NexusAI | Не требуется для первого продукта | Нет | Самостоятельные направления; архив не меняется | no dependency on them |

## Порядок и контрольные точки

### M0 — Зафиксировать contracts и provenance

До извлечения файлов: state transitions, typed call/result, approval binding, CheckSpec/Evidence, provider capability/error, Store transaction и process uncertainty. Отдельно документировать trust model для тестов.

**Acceptance:** у каждого effect есть permission, intent, failure/unknown и verifier path; нет неявной лицензии или неизвестного источника donor. Эти artifacts утверждены в документации, код пока не переносится.

### M1 — Foundation и отрицательные проверки

В следующей отдельной задаче создать изолированную новую рабочую область. Квалифицировать Bun/Windows, writer lock, SQLite migration/backup, process identity/timeout/cancel, file preconditions. Fake provider и маленький source/test fixture не требуют GPU/сети.

**Acceptance:** отрицательные fixtures выполняются до Agent integration; при блокере OS/runtime пересмотреть ADR-002/012, не переносить дополнительные modules для обхода.

### M2 — Перенос ограниченного исполнения

В порядке: Store+contracts → executor+permissions → file/check runner → verifier/completion → provider → AgentLoop → CLI. Test donor behavior сохраняется, несовместимые expectation (auto-allow writes, regex baseline, manual completion) заменяются новыми тестами с объяснением.

**Acceptance:** mock-driven fail→patch→pass с настоящим file write и process check; нет прямых imports в archive. Proof соответствует frozen task contract.

### M3 — Выборочное применение Axiom

Добавить context completeness, aborted generation и migration rollback cases. Переносить минимальные helpers только при совпадающих contracts; иначе переиспользовать test scenario, а не package целиком.

**Acceptance:** не появился node:sqlite, Express listener или React build; context overflow не удаляет constraints; provider partial calls не выполняются.

### M4 — Live qualification и release hardening

Квалифицировать один локальный endpoint/model/hardware без сети, затем выполнять red-team fault matrix, update/restore drill, clean install и замеры. Другие provider/product migrations не являются условием этого gate.

**Acceptance:** Roadmap Phase 1 и DoD выполнены с уточнениями Architecture Red Team. Незакрытые критические failures блокируют релиз.

## Миграция пользовательских данных

**До v1.0:** новая пустая DB. Архивные NexusCLI/Axiom/Minecraft/cloud stores остаются на своих местах и не открываются writer-ом новой версии. Нет silent import secret files или абсолютных instance paths. Пользователь задаёт workspace, endpoint/model и env-reference заново.

**Если позднее нужен importer:** отдельное задание с inventory и explicit selected source. Read-only snapshot, version check, deterministic ID mapping, redaction, validation, dry-run counts, отдельный destination store и rollback. Historical evidence получает origin=legacy и никогда не служит текущим passing verification нового task. Неизвестная schema или отсутствие provenance — отказ импорта. Этот importer не реализуется как условие MVP.

## Rollback и обновления новой поставки

- Перед upgrade остановить run/children либо явно урегулировать UNKNOWN; закрыть writer.
- Создать consistent DB backup с версией schema/build; сохранить предыдущий artifact.
- Применить один мигратор транзакционно, проверить integrity и открыть read-only smoke, затем разрешить runs.
- При failure не открывать old binary над новой schema. Восстановить совместимую пару binary+backup. Если новые runs уже изменяли workspace, сначала reconcile; DB rollback не откатывает их эффекты.
- Не выполнять automatic git reset, reverse patch или удаление файлов для «восстановления». Изменённые пользователем данные не принадлежат мигратору.

## Что удаляется из новой dependency graph

Parent OpenCode packages, legacy Python runtime, Minecraft UI/domain/accounts/updater, Axiom node:sqlite/Web UI/HTTP server, ML/training и editor/cloud products; донорские permissive defaults, regex execution, automatic unknown retries и manual-as-verified completion.

Физического удаления или переименования в `C:\Nexus_History` этот план не предусматривает. Source snapshots, user state и история сохраняются.

## Критерий завершения переноса

Новый продукт проходит свой frozen acceptance set и live qualification без запуска старых приложений. Для каждого перенесённого модуля есть provenance, owner, contract tests и известные пределы. Количество скопированных строк, проектов или passing donor tests не является метрикой завершения.
