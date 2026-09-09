# Nexus v1.0 — Analysis Summary

Дата: 2026-09-09. PHASE 1: анализ до архитектурных решений. Обследован `C:\Nexus_History`; отдельный путь `C:\Nexus\_History` не используется. Исходные проекты не запускались и не изменялись, зависимости не устанавливались.

## Основание и достоверность

Изучены 11 обязательных подготовительных материалов из текущей миссии: Briefing, Current State Map, Component Analysis, Architectural Conflicts, Decision Register, Red Team Review, MVP Boundary, Migration Feasibility, Vertical Slice, Definition of Done, Success Metrics. Их рекомендации не равны реализованным гарантиям. Выполнено адресное чтение composition, completion, recovery, permissions, executor, process, workspace guard, storage и provider путей NexusCLI; registry, secrets, SQLite и chat/provider путей Axiom.

Числа 46/46 NexusCLI и 32/32 Axiom — **AUDIT FINDING о предыдущем запуске**, а не новый результат этой фазы. Тесты сейчас не повторялись. Нет доказательства успешной интеграции или готового релиза v1.0.

## Подтверждённые наблюдения

| ID | Класс | Наблюдение и источник | Уверенность / предел |
|---|---|---|---|
| E01 | FACT FROM CODE | [composition.ts](C:/Nexus_History/NexusCLI/nexus/src/composition.ts) действительно собирает Store, PermissionEngine, ToolExecutor, VerificationEngine и AgentLoop | Высокая; наличие связей, не успешный live run |
| E02 | FACT FROM CODE | [completion/policy.ts](C:/Nexus_History/NexusCLI/nexus/src/completion/policy.ts) проверяет источник evidence, revision, fingerprint и неизвестные side effects | Высокая; корректность fingerprint и доверие к тесту требуют отдельной проверки |
| E03 | FACT FROM CODE | В `createContract` baseline failure выбирается по узкому regex пользовательской цели; переданный goalCheck сам по себе не добавляет обязательное воспроизведение падения | Высокая; правило непригодно как универсальная приёмка slice |
| E04 | FACT FROM CODE | [permissions/engine.ts](C:/Nexus_History/NexusCLI/nexus/src/permissions/engine.ts) задаёт WRITE_PROJECT=allow по умолчанию; классификация команд частично regex | Высокая; расходится с обязательным approval из MVP |
| E05 | FACT FROM CODE | [tools/executor.ts](C:/Nexus_History/NexusCLI/nexus/src/tools/executor.ts) пишет intent до исполнения, затем action+evidence транзакционно; uncertain side effect получает UNKNOWN | Высокая; FS/process и SQLite не образуют одну транзакцию |
| E06 | FACT FROM CODE | [recovery/policy.ts](C:/Nexus_History/NexusCLI/nexus/src/recovery/policy.ts) не повторяет команды автоматически; write/edit сверяет с afterHash | Высокая; совпадение файла не доказывает успех всей задачи |
| E07 | FACT FROM CODE | [tools/process.ts](C:/Nexus_History/NexusCLI/nexus/src/tools/process.ts) использует Bun.spawn, Windows taskkill /T, лимит вывода и фильтр имён env | Высокая; это не sandbox и не гарантия уничтожения дерева после crash |
| E08 | FACT FROM CODE | [tools/workspace.ts](C:/Nexus_History/NexusCLI/nexus/src/tools/workspace.ts) проверяет traversal/symlink; fingerprint исключает некоторые каталоги; atomicWrite использует temporary+rename | Высокая; остаются TOCTOU, hardlinks, power-loss и исключённые пути |
| E09 | FACT FROM CODE | [storage/sqlite.ts](C:/Nexus_History/NexusCLI/nexus/src/storage/sqlite.ts), [migrations.ts](C:/Nexus_History/NexusCLI/nexus/src/storage/migrations.ts): Bun SQLite, session JSON и проекции; ownership проверяет живость PID; migration v1 | Высокая; не готовый upgrade protocol и не надёжная identity процесса |
| E10 | FACT FROM CODE | [core/state.ts](C:/Nexus_History/NexusCLI/nexus/src/core/state.ts) сохраняет transition+event транзакционно, затем вызывает sink; исторический COMPLETED допускает переход RECOVERING | Высокая; терминальность run нужно отделить от продолжения session |
| E11 | FACT FROM CODE | [llm/openai-compatible.ts](C:/Nexus_History/NexusCLI/nexus/src/llm/openai-compatible.ts) собирает tool fragments, отклоняет length/content_filter, ограничивает HTTP retry | Высокая; конкретный endpoint и модель не проверены live |
| E12 | FACT FROM CODE | [Axiom SQLite](C:/Nexus_History/Axiom/packages/storage/src/sqlite.ts) использует node:sqlite и восстанавливает generating→aborted; [ChatCore](C:/Nexus_History/Axiom/packages/core/src/chat.ts) управляет generation отдельно | Высокая; нельзя запускать его мигратор поверх NexusCLI DB |
| E13 | FACT FROM CODE | [Axiom registry](C:/Nexus_History/Axiom/packages/core/src/registry.ts) отделяет конфигурацию и secrets; [provider](C:/Nexus_History/Axiom/packages/providers/src/openai-compatible.ts) отвергает неподдержанные части сообщений | Высокая; общие tool types не равны готовому tool executor |
| E14 | FACT FROM CODE | [secrets.ts](C:/Nexus_History/Axiom/packages/storage/src/secrets.ts) хранит master.key рядом с secrets.json; registry регистрирует только encrypted-file backend | Высокая; не переносить как OS vault |
| E15 | FACT FROM CODE | [redact.ts](C:/Nexus_History/NexusCLI/nexus/src/shared/redact.ts) — шаблонная редактировка строк; не универсальное обнаружение секретов | Высокая; обещание «никаких секретов вообще» недоказуемо |
| E16 | FACT FROM CODE | [test/helpers.ts](C:/Nexus_History/NexusCLI/nexus/test/helpers.ts) содержит маленький fixture add и реальный процесс проверки; [NexusTest/math.js](C:/Nexus_History/NexusTest/math.js) вычитает | Высокая; пригодность fixture, не доказанное назначение NexusTest |
| E17 | AUDIT FINDING | Minecraft имеет две копии, JSON ledger, Java discovery, монолитный Launcher, plaintext tokens и permissive checksum policy | Средняя; детально описано в Minecraft Analysis, в этой фазе не перепроверено |
| E18 | AUDIT FINDING | MiniCursor=каталог cli; GPU поведение не подтверждено; Old Nexus security/completion имеют ограничения; Maker отдельный редактор | Средняя; исходники этих проектов повторно не исследовались |

## Несоответствия подготовительных требований

1. **CLI или Web UI.** Component Analysis рекомендует оба; MVP допускает один клиент. Это решение scope, а не обязательная интеграция Axiom.
2. **Local-first / cloud dependency.** Remote provider допустим лишь по явному выбору; обязательность коммерческого endpoint противоречит текущему запрету cloud dependency. Нужен реальный локальный endpoint для offline acceptance, mock один продуктовую пользу не доказывает.
3. **Permission не sandbox.** Тест выполняет код проекта с правами пользователя. Строка allowlisted argv не запрещает тесту читать домашний каталог или обращаться к сети. Threat model обязан ограничить поддержанные репозитории.
4. **Baseline до patch.** Vertical Slice описывает повторный запуск, но не задаёт достаточно строго первый failing run. Нужны неизменяемые тест/команда и observed fail→pass; пользовательское «тест прошёл» не заменяет automation evidence.
5. **Cancelled против Unknown.** В подготовке три terminal state, хотя есть отмена и отказ. Известная отмена должна отличаться от неопределённого эффекта.
6. **Артефакты теста против unexpected diff.** Кэш/временные файлы допустимы только в объявленной области; blanket «ни одного изменённого файла» не годится для большинства runner-ов.
7. **Метрики — пока гипотезы.** 3 секунды запуска, 5 МБ состояния, 20/20 mock runs не являются замерами или статистическим доказательством успеха на реальных задачах. 0 false completion в тестах — release gate на корпусе, не универсальная гарантия.
8. **Storage damage.** Невозможно обещать сохранение последнего состояния при произвольной порче диска. Нужны backup, явная потеря интервала и read-only отказ; repair не должен фабриковать evidence.
9. **Terminology.** Историческая AgentSession совмещает задачу, диалог и попытки. Требуется разделить терминальность попытки и продолжение работы, не создавая generic job framework.

## Главные архитектурные вопросы

**DECISION REQUIRED:** один runtime; CLI-only scope; минимальный task contract; момент approval и привязка к bytes/argv; доверие к проверкам; owner lock и неизвестные процессы; schema ownership; model endpoint без обязательного облака; secrets без нового vault; bounded context; release gates и contracts-first перенос.

**STARTING HYPOTHESIS:** адаптировать execution NexusCLI и отдельные правила Axiom; остальные продукты оставить вне релиза. Подтверждается локальными источниками E01–E16, но техническая стоимость процесса/хранилища пока не измерена.

## Проверки, оставшиеся для реализации

- Windows clean build с закреплённым Bun и process fixtures: отказ старта, отмена, дерево потомков, PID reuse, потеря exit status.
- Проверка реальной локальной модели на structured tool calls; конкретная модель/оборудование — неподтверждённый release input.
- Negative tests approval replay, concurrent edits, links, truncated provider response, altered test harness, DB full/corruption.
- Измерение полного slice и размера state; повтор исторических тестов в чистой среде после переноса.
- Проверка происхождения/лицензионных уведомлений каждого переносимого файла; не считать parent OpenCode собственным Nexus.

На этом анализ завершён. Следующие документы отдельно фиксируют решения, проектируемое поведение и проверки, которые ещё предстоит реализовать.
