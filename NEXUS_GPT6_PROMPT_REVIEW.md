# Review архитектурного промпта для GPT-6

Дата: 9 сентября 2026 года  
Статус: **предварительный review; исходный GPT-6 промпт ещё не предоставлен**.

## Ограничение проверки

В архиве `C:\Nexus_History` не найден текст большого архитектурного промпта, который пользователь планирует отправить GPT-6. Поэтому line-by-line проверка, поиск повторов в конкретных абзацах и указание точных мест противоречий пока невозможны. Этот документ не притворяется выполненным review: он фиксирует предварительный редакторский чек-лист и требования к следующей версии. После появления промпта каждую запись нужно привязать к разделу/абзацу и классифицировать как реальную проблему или уже закрытый пункт.

## Предварительные issues

### Issue: отсутствуют проверяемые критерии успеха

**Why it matters:** GPT-6 может создать красивую архитектурную схему без способа определить, стала ли система полезной, безопасной и воспроизводимой.

**Suggested improvement:** в промпте явно отделить цели продукта, non-goals, acceptance criteria и evidence required for each major decision. Добавить минимальный вертикальный сценарий и definition of done.

**Priority:** HIGH

### Issue: scope может незаметно включить всю экосистему

**Why it matters:** архив содержит chat, coding agent, Minecraft, cloud, IDE, browser, Maker, training и будущие продукты. Без жёсткой границы GPT-6 начнёт проектировать платформу вместо v1.0.

**Suggested improvement:** перечислить in-scope/out-of-scope и дать ссылку на parking lot. Для каждой внешней идеи требовать отдельный ADR, а не включать её по умолчанию.

**Priority:** HIGH

### Issue: архитектура, миграция и реализация могут быть смешаны

**Why it matters:** пользователь сейчас просит подготовить решения, но не писать код и не начинать миграцию. GPT-6 может перейти к scaffolding, package moves или техническому плану до выбора границ.

**Suggested improvement:** в начале промпта поставить явный порядок: understand evidence → state decisions → propose alternatives → wait for approval/next phase. Запретить изменения файлов на architectural phase.

**Priority:** HIGH

### Issue: рекомендации аудита могут быть восприняты как принятые решения

**Why it matters:** формулировки «основа Core», «основной источник» и «выбрать Bun» имеют разную степень уверенности. Неправильное чтение закрепит необратимый выбор.

**Suggested improvement:** маркировать каждый входной пункт как FACT FROM CODE, AUDIT FINDING, ASSUMPTION или RECOMMENDATION; требовать от GPT-6 явно перечислять unresolved decisions.

**Priority:** HIGH

### Issue: не указан источник доказательств и ограничения аудита

**Why it matters:** часть тестов запускалась в временной копии, GUI/OAuth/Popen/network не проверялись, а archive links могут быть непереносимы.

**Suggested improvement:** передать GPT-6 evidence matrix с confidence и needs verification; запретить называть компонент production-ready только по README или passing unit tests.

**Priority:** HIGH

### Issue: Host Runtime может быть задан неявно

**Why it matters:** Bun и Node используют разные SQLite/process APIs. Неявное предположение приведёт к дорогой переделке storage и packaging.

**Suggested improvement:** вынести Host Runtime в обязательный ADR с вариантами, критериями стоимости адаптации, поддерживаемыми версиями и fallback policy.

**Priority:** HIGH

### Issue: Core boundary не имеет отрицательного определения

**Why it matters:** если промпт говорит только, что нужно включить, GPT-6 может перенести в Core PySide6, Minecraft loaders, billing, IDE или browser.

**Suggested improvement:** потребовать явные списки Core, adapters, clients, cloud services и legacy references, включая forbidden dependencies.

**Priority:** HIGH

### Issue: Agent и Chat описаны как одна задача

**Why it matters:** обычный assistant response не должен иметь те же permissions, recovery и completion semantics, что side-effect task.

**Suggested improvement:** потребовать две state machines или обоснование единого loop: lifecycle, cancellation, context, tool access, evidence and completion для каждого режима.

**Priority:** HIGH

### Issue: Tool protocol может остаться на уровне слов

**Why it matters:** в архиве есть typed executor NexusCLI и опасный legacy text-to-action path. Неясный протокол создаёт риск выполнения произвольного текста модели.

**Suggested improvement:** запросить конкретные schemas для call/result/error/approval/capability, timeout, idempotency, replay, audit и legacy adapter policy.

**Priority:** HIGH

### Issue: Event streaming может быть недоопределён

**Why it matters:** token deltas, task events, downloads, process output и approvals имеют разные durable/ephemeral semantics.

**Suggested improvement:** обязать описать event envelope, sequence/correlation IDs, ordering, reconnect/replay, backpressure и transport adapters.

**Priority:** HIGH

### Issue: Storage и schema migration упомянуты без ownership

**Why it matters:** Axiom, NexusCLI и Minecraft имеют разные stores и версии. Простое «использовать SQLite» не отвечает, какие tables canonical и как импортировать данные.

**Suggested improvement:** запросить entity ownership, migration/versioning policy, backup/repair, multi-process locking, import/export и rollback.

**Priority:** HIGH

### Issue: Memory может быть ошибочно объявлена RAG

**Why it matters:** history, task context, profile, retrieval index и cache — разные вещи; legacy `VectorMemory` не доказывает vector search.

**Suggested improvement:** разделить memory classes, retention/deletion/provenance и явно решить, входит ли vector/RAG в v1.0.

**Priority:** HIGH

### Issue: Security model не привязана к threat actors

**Why it matters:** local file tools, cloud tenant data, OAuth tokens, downloaded plugins и updates имеют разные угрозы.

**Suggested improvement:** добавить threat model, capability/approval policy, secret storage, network restrictions, update authenticity, plugin isolation и security release blockers.

**Priority:** HIGH

### Issue: Process management не имеет recovery contract

**Why it matters:** Minecraft `Popen`, model servers и tools требуют разных PID, output, kill-tree, timeout и restart semantics.

**Suggested improvement:** потребовать supported process classes, identity model, persisted handles, crash reconciliation, cancellation и platform scope.

**Priority:** HIGH

### Issue: Provider system смешивает catalog, endpoint и credentials

**Why it matters:** Axiom, NexusCLI, MiniCursor и cloud models имеют разные capability, streaming, billing и secret ownership.

**Suggested improvement:** разделить model catalog, provider transport, runtime/backend, account/secret binding и capability contract.

**Priority:** MEDIUM

### Issue: Cloud, IDE, Browser и Minecraft могут быть ошибочно объявлены Core features

**Why it matters:** эти направления имеют отдельные deployment, security и release boundaries.

**Suggested improvement:** для каждого определить роль: Core dependency, optional adapter, separate client или future idea. Прямо попросить список non-goals.

**Priority:** HIGH

### Issue: migration plan может появиться раньше decision register

**Why it matters:** перенос компонентов до ADR по runtime, storage, secrets и protocols закрепит несовместимые assumptions.

**Suggested improvement:** требовать порядок deliverables: decision register → accepted contracts → spike/verification → migration plan → implementation plan.

**Priority:** HIGH

### Issue: тесты и external dependencies не имеют risk tiers

**Why it matters:** выбранные тесты не покрывают GUI, OAuth, updater, Popen, live models и multi-process state.

**Suggested improvement:** разделить unit, contract, hermetic integration, security, recovery, UI and release tests; для внешних систем указать mock/fixture policy.

**Priority:** MEDIUM

### Issue: длина промпта может скрыть приоритеты

**Why it matters:** большой архивный контекст без hierarchy заставит модель оптимизировать подробность вместо ключевых решений.

**Suggested improvement:** не удалять смысл, а структурировать: mission → hard constraints → evidence → conflicts → decisions → non-goals → required output → stop condition. Повторяющиеся ограничения объявить один раз и ссылаться на них.

**Priority:** MEDIUM

### Issue: повторы могут создать разные формулировки одного требования

**Why it matters:** если «не писать код», «не мигрировать» и «только проектировать» повторяются с разными исключениями, модель может выбрать более мягкую версию.

**Suggested improvement:** завести единый блок immutable constraints и в остальных разделах ссылаться на него. При конфликте указать приоритет правил.

**Priority:** MEDIUM

### Issue: отсутствует явный формат ответа GPT-6

**Why it matters:** без схемы ответа Principal Architect может пропустить alternatives, assumptions, rejection criteria и open questions.

**Suggested improvement:** потребовать фиксированный output: executive summary, evidence/confidence, boundaries, ADRs, rejected options, risks, verification plan, non-goals и stop point; архитектура должна быть отдельно от нерешённых вопросов.

**Priority:** MEDIUM

### Issue: нет правила обработки неизвестного

**Why it matters:** архив неполон, ZIP и live services не всегда исследованы, а названия проектов не гарантируют хронологию.

**Suggested improvement:** обязать GPT-6 маркировать unknown/needs verification, не заполнять пробелы выдуманными facts и формировать targeted inspection questions.

**Priority:** HIGH

## Что проверить после получения полного промпта

1. Повторяются ли mission, scope, non-goals и stop condition в нескольких разделах.
2. Не конфликтуют ли «не проектировать финальную архитектуру» и требования представить конкретные modules, schemas или package tree.
3. Не названы ли рекомендации audit reports обязательными решениями.
4. Есть ли вопрос об owner/approval каждого ADR.
5. Указаны ли runtime versions, target OS, offline requirements, threat model и data retention.
6. Требуется ли от модели отличать code fact от README claim и inference.
7. Присутствует ли порядок работы и формат deliverables.
8. Есть ли явная команда остановиться после подготовки решений, не меняя файлы.

## Редакторское правило

Промпт не нужно сокращать за счёт смысла. Сначала нужно убрать противоречия, вынести повторяющиеся ограничения в один блок, отделить evidence от recommendations и дать GPT-6 ясную очередь решений. Точная редакция возможна только после получения исходного текста.

## Финальный статус проверки MASTER PROMPT

Во время этой проверки файл `NEXUS_GPT6_MASTER_PROMPT.md` в `C:\Nexus_History` не найден. Рекурсивный поиск Markdown-файлов также не обнаружил другой копии с этим именем. Поэтому следующие операции невозможны без исходного текста:

| Проверка | Статус | Что можно утверждать сейчас |
|---|---|---|
| Сопоставить каждый раздел MASTER PROMPT с аудитами | **BLOCKED** | Составлен самостоятельный V2 на основе доступных материалов и текущего задания |
| Найти точные повторы по абзацам | **BLOCKED** | Выделены повторы, которые V2 должен свести в единые блоки constraints и workflow |
| Найти внутренние противоречия исходной версии | **BLOCKED** | Зафиксированы конфликты, которые V2 обязан явно вынести на решение GPT-6 |
| Проверить пропущенные P0/P1/P2 | **PARTIAL** | Сформирован приоритетный список по Decision Register, MVP Boundary и Red Team |
| Проверить terminology в исходном тексте | **BLOCKED** | В V2 добавлено обязательное раннее определение canonical terms |

`NEXUS_GPT6_MASTER_PROMPT_V2.md` является рабочей самостоятельной заменой, а не доказательством того, что отсутствующая V1 была полностью проверена. После появления V1 нужно провести короткий diff-review: подтвердить, что все её специфические требования сохранены, и удалить этот статус BLOCKED только на основании фактического текста.

## Критические требования, которые должны присутствовать в V2

1. Не принимать NexusCLI как обязательный Agent Core: это главный проверенный кандидат, но не заранее принятое ADR.
2. Не считать Axiom готовым Agent Core: его сильная сторона — Chat/UI/storage lifecycle.
3. Не переносить Minecraft, MiniCursor, Maker и cloud surface в MVP без отдельного решения о границе.
4. Не смешивать local-first single-user MVP с cloud, teams, marketplace, IDE, browser, multi-agent или training scope.
5. Обязать GPT-6 решить P0 до детализации P1/P2 и провести red-team review после проектирования.
6. Обязать различать fact, audit finding, starting hypothesis, mandatory invariant и decision required.
7. Требовать адресную проверку исходного кода по неопределённым местам вместо повторного полного аудита архива.

## Матрица полноты, которую должна закрывать V2

Поскольку исходная V1 отсутствует, ниже перечислены не утверждения о её фактическом содержимом, а обязательные coverage checks для самостоятельной версии.

| Подготовительный материал | Что нельзя потерять в Master Prompt | Статус в V2 |
|---|---|---|
| `NEXUS_GPT6_BRIEFING.md` | карта ролей NexusCLI, Axiom, Minecraft, Old Nexus, MiniCursor, Maker и cloud; доказанные/не доказанные факты | Включено в mission, evidence rules и starting hypotheses |
| `NEXUS_ARCHITECTURAL_CONFLICTS.md` | Agent/Chat, Bun/Node, SQLite, memory, tools, providers, events, APIs, process/runtime и security conflicts | Включено как P0 decisions и mandatory questions |
| `NEXUS_DECISION_REGISTER.md` | все обязательные ADR-вопросы и нерешённость рекомендаций | 16 P0 плюс P1/P2 grouping |
| `NEXUS_MVP_BOUNDARY.md` | single-user local-first, one execution path/client/provider/store, evidence/recovery, NOT NOW | Включено в hard constraints и P0/MVP |
| `NEXUS_CURRENT_STATE_MAP.md` | фактические entry points, languages, tests, dependencies, risks и MiniCursor=`cli` alias | Используется через manifest и evidence phase |
| `NEXUS_RED_TEAM_REVIEW.md` | false success, duplicate effects, crash/restart, storage, memory leakage, security и one-developer risks | Включено в Phase 3 red-team |
| `NEXUS_MIGRATION_FEASIBILITY.md` | adapt NexusCLI/Axiom; wrap Minecraft/MiniCursor; archive Old Nexus; separate Maker | Включено как starting hypotheses, которые можно опровергнуть evidence |
| `NEXUS_AUDIT.md` | initial completeness limits, OpenCode vs standalone NexusCLI, historical uncertainty | Включено в evidence boundary и manifest |
| `NEXUS_COMPONENT_ANALYSIS.md` | tested vs untested claims, stale old audit, selected component strengths/weaknesses | Включено в targeted source verification rule |
| `NEXUS_MINECRAFT_ANALYSIS.md` | two launcher copies, launcher/auth/updater/process limitations | Включено в manifest as targeted input, not implicit MVP scope |
| `NEXUS_FUTURE_IDEAS.md` | future ideas remain parked and cannot enlarge v1.0 | Включено в P2 and hard constraints |

## Конфликты и рекомендуемая формулировка для Master Prompt

Эти конфликты должны быть явно видны GPT-6. Формулировки ниже не принимают решение, а запрещают молчаливое смешение scope.

### Conflict: local-first MVP vs cloud capabilities

**Why ambiguous:** cloud project contains models, memory, connectors, auth and billing, while MVP boundary requires local single-user. Без явной границы GPT-6 может включить cloud dependencies в Core.

**Suggested wording:** «Считать local single-user runtime обязательным scope v1.0. Cloud, teams, billing, connectors и tenant auth рассматривать только как отдельные future/client boundaries; если включение предлагается, оформить это как отдельный P0 decision с impact и отказом от MVP ограничения».

### Conflict: modular monolith vs optional services

**Why ambiguous:** слова “modular” и “services” могут привести к микросервисной схеме, хотя один разработчик не может обслуживать distributed deployment.

**Suggested wording:** «Начать с modular monolith. Выносить service только при доказанной operational boundary, а не ради будущего масштабирования; описать migration trigger и стоимость поддержки».

### Conflict: migration vs rewrite

**Why ambiguous:** «перенести лучшие части» может означать copy/paste, а «новая архитектура» — потерю проверенного поведения и данных.

**Suggested wording:** «Сначала принять contracts и evidence. Для каждого компонента выбрать migrate/adapt/wrap/separate/archive; не менять код и не импортировать данные до acceptance criteria и rollback plan».

### Conflict: MVP vs future extensions

**Why ambiguous:** наличие Minecraft, Maker, MiniCursor, cloud, browser и IDE создаёт давление включить их в общий Core.

**Suggested wording:** «MUST HAVE определяется основным local workflow. SHOULD HAVE и NOT NOW не могут менять P0 design; future idea допускается только как non-goal или future gate».

### Conflict: one Agent Core vs multi-agent future

**Why ambiguous:** будущий multi-agent может заставить GPT-6 создать orchestration, budgets и event graph, которые не нужны одному агенту.

**Suggested wording:** «Спроектировать один проверяемый Agent/Task lifecycle. Multi-agent — P2 и не должен добавлять coordination abstractions до доказанной необходимости».

### Conflict: one runtime vs external Python inference

**Why ambiguous:** Core может выбрать один host runtime, но MiniCursor и Minecraft остаются Python processes. Это не требует двух runtime внутри Core, однако prompt может смешать host и external process.

**Suggested wording:** «Разделять primary host runtime и внешние process adapters. Не считать внешний Python/CUDA process вторым равноправным Core runtime; определить IPC/process contract только если local model входит в accepted scope».

### Conflict: unified storage vs different persistence domains

**Why ambiguous:** единый store нужен для task truth, но secrets, model artifacts, Minecraft files и editor documents имеют разные lifecycle и ownership.

**Suggested wording:** «Выбрать один authoritative store для v1.0 task/session/evidence state. Отдельные file/secret/domain stores разрешены только с явным ownership, reference, backup и migration semantics; “one database” не означает “all data in one table”».

### Conflict: recommendations vs decisions

**Why ambiguous:** выражения “NexusCLI основа”, “Axiom лучше для UI” и “Minecraft wrap” могут стать неявными ADR.

**Suggested wording:** «Все audit choices помечать STARTING HYPOTHESIS. GPT-6 обязан подтвердить, изменить или отклонить их по evidence; ни одна рекомендация не является mandatory invariant без отдельного decision record».
