# Nexus v1.0 — Success Metrics

Дата: 9 сентября 2026 года  
Назначение: измерить инженерный успех Nexus v1.0 в пределах [MVP Boundary](C:/Nexus_History/NEXUS_MVP_BOUNDARY.md), [Vertical Slice](C:/Nexus_History/NEXUS_VERTICAL_SLICE.md) и [Definition of Done](C:/Nexus_History/NEXUS_DEFINITION_OF_DONE.md).  
Граница: это не SaaS analytics, не маркетинговый план и не оценка будущих продуктов. Метрики относятся к local-first single-user MVP.

## Правила измерения

1. Сначала измеряется deterministic mock-provider path; live provider измеряется отдельно и не скрывает ошибки Core.
2. Каждый результат записывается вместе с commit, OS/runtime, test fixture и конфигурацией.
3. Для latency и size используются минимум 20 повторов или все случаи fault-injection suite, если сценарий дороже.
4. Разовые лучшие значения не считаются успехом: используются median и p95, а для safety — нулевая терпимость к нарушению инварианта.
5. Метрика должна иметь понятный источник: automated test, local benchmark, evidence bundle или clean-install report.
6. Если среда влияет на значение, публикуются baseline и предел применимости, а не универсальное обещание.

## 1. User Value

User Value здесь означает инженерно наблюдаемую пользу одного локального пользователя: Nexus доводит ограниченную задачу до проверяемого результата и позволяет понять, что произошло.

### U-01. Сквозное выполнение поддержанной задачи

**Что измеряется:** доля запусков vertical slice, которые проходят от запроса до корректного terminal result.

**Цель v1.0:** 100% успешных deterministic fixture runs; каждый нестандартный/ошибочный fixture должен завершаться диагностируемым `Failed` или `Unknown`.

**Источник:** acceptance suite и test report.

### U-02. Проверяемая польза результата

**Что измеряется:** в каждом `Succeeded` одновременно присутствуют подтверждённый patch, успешная проверка и соответствующий evidence.

**Цель v1.0:** 100% успешных результатов удовлетворяют всем трём условиям; результат только от текста модели не засчитывается.

**Источник:** automated assertion над task/evidence record и итоговым diff.

### U-03. Ограниченность изменения

**Что измеряется:** число неожиданных файлов, side effects или команд в успешной задаче.

**Цель v1.0:** 0 неожиданных файлов, 0 неразрешённых команд и 0 выходов за workspace в acceptance и adversarial suite.

**Источник:** filesystem snapshot, action ledger и process record.

### U-04. Понятный результат для пользователя

**Что измеряется:** пользователь может определить итог без чтения внутренних логов: `Succeeded`, `Failed` или `Unknown`, причина, изменённый target и проверка.

**Цель v1.0:** 100% terminal states содержат эти поля в основном клиенте и persisted evidence.

**Источник:** UI/CLI acceptance test и snapshot результата.

### U-05. Повторяемость

**Что измеряется:** одинаковый input, fixture и mock provider дают сопоставимый terminal state, bounded diff и evidence shape.

**Цель v1.0:** 20/20 повторов deterministic fixture дают один ожидаемый итог; расхождение допускается только в timestamps и process identifiers.

**Источник:** repeatability test.

### U-06. Восстановимость результата пользователем

**Что измеряется:** после закрытия и повторного запуска пользователь находит задачу и её evidence без повторного выполнения side effect.

**Цель v1.0:** 100% проверенных success/failure/unknown fixtures восстанавливаются с тем же task identity и terminal state.

**Источник:** restart acceptance test.

## 2. Agent Quality

Agent Quality измеряется не красотой ответа, а правильностью действий и итоговых утверждений.

### A-01. Успешные задачи

**Что измеряется:**

`correct_successes / eligible_deterministic_tasks`

где успешной считается задача с правильным patch, успешной verification и полным evidence.

**Цель v1.0:** 100% для обязательного deterministic acceptance set. Live-provider success rate публикуется отдельно и не может компенсировать провал Core fixtures.

**Источник:** versioned task fixture set.

### A-02. False completion

**Что измеряется:** число случаев, когда Nexus сообщает `Succeeded`, хотя patch, test, exit status или evidence не подтверждают результат.

**Цель v1.0:** 0 случаев в acceptance, fault-injection и adversarial suite. Это safety invariant, а не среднее значение.

**Источник:** намеренно сломанные provider/tool/process/storage fixtures.

### A-03. False failure

**Что измеряется:** число случаев, когда подтверждённая задача помечена `Failed`/`Unknown` из-за дефекта Nexus, а не из-за реальной ошибки fixture.

**Цель v1.0:** 0 в deterministic acceptance set; любые live-provider расхождения классифицируются отдельно.

**Источник:** golden success fixtures и verification assertions.

### A-04. Recovery correctness

**Что измеряется:** доля injected faults, которые завершаются допустимым `Failed`/`Unknown`, сохраняют последнюю известную state и не повторяют side effect молча.

**Цель v1.0:** 100% fault cases; 0 duplicate patch/command after retry without new authorization.

**Источник:** crash, timeout, cancellation, corrupt state и lost exit-status tests.

### A-05. Permission correctness

**Что измеряется:**

- denied action срабатывает без side effect;
- approved action выполняется только для показанных target/arguments;
- изменённый после approval target блокируется.

**Цель v1.0:** 100% pass для permission/approval matrix.

**Источник:** security fixtures and action ledger.

### A-06. Tool protocol validity

**Что измеряется:** доля tool calls с валидной schema, target boundary, action identifier, timeout policy и result/error record.

**Цель v1.0:** 100% calls в поддержанном slice; invalid calls не выполняются.

**Источник:** contract tests и structured action records.

### A-07. Evidence completeness

**Что измеряется:** наличие request, session/task/run/action identifiers, approval, patch/command metadata, execution status, verification и timestamps.

**Цель v1.0:** 100% terminal tasks имеют обязательные evidence fields; 0 secrets в evidence.

**Источник:** schema assertion и secret scan.

## 3. Performance

Performance измеряется на одной документированной поддерживаемой среде. Provider network latency отделяется от локального orchestration overhead.

### P-01. Время запуска

**Что измеряется:** от запуска основного клиента до готовности принять User Input, без ожидания внешней модели.

**Цель v1.0:** median ≤ 3 секунд, p95 ≤ 5 секунд на baseline machine.

**Источник:** startup benchmark.

### P-02. Время создания session/task

**Что измеряется:** от принятия User Input до persisted task identity и отображения начального состояния.

**Цель v1.0:** median ≤ 500 мс, p95 ≤ 1 секунды на локальном storage.

**Источник:** instrumented lifecycle test.

### P-03. Локальный orchestration overhead

**Что измеряется:** время от получения provider result до сформированного typed tool call/permission request, без model network time.

**Цель v1.0:** median ≤ 500 мс, p95 ≤ 2 секунд для vertical slice.

**Источник:** timestamped events.

### P-04. First provider response

**Что измеряется:** время от отправки model request до первого валидного ответа/ошибки. Network/provider latency измеряется отдельно.

**Цель v1.0:** не задавать универсальный provider SLA; публиковать median/p95 baseline для каждого поддерживаемого provider path. Локальный Core не должен добавлять не измеренный существенный overhead.

**Источник:** provider contract benchmark.

### P-05. Persistence latency

**Что измеряется:** время записи task/action/evidence state после каждого обязательного перехода.

**Цель v1.0:** median ≤ 100 мс, p95 ≤ 500 мс для локальной task fixture; запись не должна откладываться до финала.

**Источник:** storage benchmark.

### P-06. Размер состояния

**Что измеряется:** размер persisted session/task/evidence для одного завершённого vertical slice без model weights и project files.

**Цель v1.0:** базовый fixture имеет зафиксированный размер и не растёт неограниченно при повторном чтении; p95 ≤ 5 МБ для стандартного slice.

**Источник:** storage size report и repeated-run test.

### P-07. Output и context bounds

**Что измеряется:** максимальный сохранённый tool output и context, переданный provider, для поддержанного сценария.

**Цель v1.0:** границы заданы конфигурацией и тестируются; превышение даёт controlled truncation/error, а не неконтролируемый рост state.

**Источник:** boundary tests.

### P-08. Test execution time

**Что измеряется:** время обязательного mock-provider acceptance suite без внешней сети.

**Цель v1.0:** median ≤ 60 секунд, p95 ≤ 3 минут на baseline CI/локальной среде; зависшие тесты имеют timeout.

**Источник:** CI report.

## 4. Maintainability

Maintainability оценивается для одного разработчика, который не имеет отдельной cloud operations, security или QA команды.

### M-01. Количество обязательных runtime components

**Что измеряется:** число runtime/process/service components, которые необходимо установить для основного MVP path.

**Цель v1.0:** один primary host runtime, одно каноническое локальное storage boundary, один основной клиент и один обязательный provider contract. Внешние process dependencies допускаются только для поддержанного test command и должны быть документированы.

**Источник:** clean-install manifest.

### M-02. Clean installation time

**Что измеряется:** время от чистой поддерживаемой среды до запуска mock-provider vertical slice.

**Цель v1.0:** ≤ 30 минут без ручного исправления скрытых paths, архивных junctions или исходного кода.

**Источник:** повторяемый clean-install report.

### M-03. First diagnostic time

**Что измеряется:** время от получения Failed/Unknown до определения action, причины и последнего известного state по evidence.

**Цель v1.0:** ≤ 15 минут для типовых provider, tool, permission, process и storage fixtures.

**Источник:** timed troubleshooting exercise.

### M-04. Recovery after failure

**Что измеряется:** время восстановления usable local state после injected crash/corrupt-state fixture, не включая ручное написание нового кода.

**Цель v1.0:** ≤ 30 минут для documented recovery path; если восстановление невозможно, loss и manual reset явно документированы.

**Источник:** recovery drill.

### M-05. Mandatory test surface

**Что измеряется:** доля обязательных MVP behaviors, покрытых автоматическими tests: success, failure, unknown, cancellation, permission, traversal, secret redaction, storage migration и restart.

**Цель v1.0:** 100% перечисленных release gates имеют хотя бы один deterministic test; UI polish и необязательные adapters не входят в denominator.

**Источник:** traceability matrix requirements → tests.

### M-06. Reproducible command surface

**Что измеряется:** количество documented commands, необходимых для install, test, run, diagnostics и release check.

**Цель v1.0:** один основной путь для каждого действия; aliases не создают разные config/session roots.

**Источник:** developer runbook review.

### M-07. Change impact for supported slice

**Что измеряется:** сколько независимых components и test groups требуется затронуть для локального изменения в одном поддержанном tool/provider path.

**Цель v1.0:** изменение не требует синхронного редактирования нескольких исторических projects, clients и runtimes; каждый cross-boundary change имеет contract test.

**Источник:** dry-run небольшого исправления и review dependency graph.

### M-08. Объём обязательной документации

**Что измеряется:** наличие коротких инструкций для install, run, configuration, troubleshooting, recovery и release.

**Цель v1.0:** новый разработчик может выполнить vertical slice и разобрать fault fixture без устной передачи скрытых знаний.

**Источник:** independent runbook exercise.

## 5. Что НЕ измерять в v1.0

Следующие показатели не являются критериями инженерной готовности MVP и не должны менять P0 decisions:

- DAU/MAU, retention, conversion, funnel и другие SaaS/product analytics;
- revenue, billing volume, ARPU, cloud cost per tenant и marketplace GMV;
- число зарегистрированных пользователей, teams или workspaces;
- маркетинговый охват, downloads, stars, social mentions и brand awareness;
- количество поддерживаемых моделей, tools, plugins, browsers или IDE features само по себе;
- размер ecosystem, число интеграций и количество строк кода;
- «красота» UI, число тем, screens и визуальный feature parity;
- автономность multi-agent system, если multi-agent не входит в MVP;
- benchmark качества модели без привязки к поддержанному task/evidence path;
- общая latency cloud services, которые не требуются local-first MVP;
- GPU throughput, training loss и размер датасета, если local training не входит в v1.0;
- Minecraft launch time, Modrinth coverage или game account count;
- synthetic scalability для multi-tenant, distributed services или public API, исключённых из scope.

## Release interpretation

Nexus v1.0 успешен, если один разработчик может воспроизводимо показать полезный local task workflow, а система:

1. не объявляет невыполненное действие успешным;
2. не теряет известное состояние при ошибке;
3. показывает `Failed`/`Unknown`, когда результат нельзя доказать;
4. защищает side effects approval, workspace policy и audit/evidence;
5. укладывается в документированные performance и state-size bounds;
6. устанавливается, диагностируется и обновляется одним разработчиком;
7. не требует будущих cloud, browser, IDE, Minecraft, plugin, training или multi-agent направлений.

Дополнительные функции не компенсируют провал этих инженерных критериев.
