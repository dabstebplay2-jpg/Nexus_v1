# Nexus v1.0 — Definition of Done

Дата: 9 сентября 2026 года  
Назначение: объективно определить, когда Nexus v1.0 можно считать готовым к выпуску в пределах [MVP Boundary](C:/Nexus_History/NEXUS_MVP_BOUNDARY.md) и первого [Vertical Slice](C:/Nexus_History/NEXUS_VERTICAL_SLICE.md).  
Ограничение: критерии не добавляют новые функции. Они проверяют, что уже выбранный MVP-путь работает безопасно, воспроизводимо и поддерживаемо одним разработчиком.

## Правило оценки

Требование считается выполненным только при наличии наблюдаемого результата:

- автоматического теста;
- воспроизводимой ручной проверки;
- или записи clean-install/release проверки.

README, наличие класса или passing теста отдельного исторического проекта не являются доказательством готовности Nexus v1.0. Если результат нельзя проверить или состояние нельзя восстановить, критерий считается не выполненным.

---

## 1. Functional Requirements

### F-01. Основной пользовательский сценарий проходит целиком

Один локальный пользователь может отправить задачу в основном клиенте, получить план, подтвердить изменение, дождаться проверки и увидеть итог.

**Проверка:** vertical slice выполняется от начала до конца в чистом тестовом workspace.

### F-02. Session и task/run создаются явно

Каждая задача получает сохраняемые identifiers и начальный статус. После создания она видна пользователю и не существует только в памяти UI.

**Проверка:** закрыть и снова открыть клиент после создания task; session/task остаются доступными с тем же identity.

### F-03. Контекст ограничен рабочей задачей

Model request содержит только релевантные файлы, текущую session, workspace policy и доступные capabilities. Чужие sessions, скрытые secrets и нерелевантный архив не подмешиваются.

**Проверка:** deterministic fixture проверяет состав context и отсутствие secret markers.

### F-04. План и tool intent имеют проверяемый формат

Provider response может быть принят как plan/tool intent только после schema validation. Невалидный или неоднозначный ответ не запускает side effect.

**Проверка:** mock provider возвращает valid, invalid и incomplete responses; invalid paths завершаются ошибкой без изменения файлов.

### F-05. Поддержанные tools выполняют ограниченный сценарий

Nexus может читать релевантные файлы, подготовить bounded patch и запустить одну разрешённую тестовую команду. Каждый action имеет target, identifier и result.

**Проверка:** успешный vertical slice изменяет только ожидаемый файл и запускает только указанную проверку.

### F-06. Permission/approval предшествует side effect

Запись файла и запуск тестовой команды показывают пользователю target, diff summary и command до выполнения. Отказ не создаёт side effect.

**Проверка:** отклонить approval и убедиться, что файл, процесс и storage result не изменились за пределами отказа/audit record.

### F-07. Verification проверяет фактический результат

Success возможен только если разрешённый тест завершился ожидаемым status и итоговый diff соответствует подтверждённому изменению.

**Проверка:** отдельно проверить success test + unexpected diff, failed test + correct diff и successful test + wrong file.

### F-08. Результат имеет честный terminal state

Пользователь видит только один из поддержанных итогов: `Succeeded`, `Failed` или `Unknown`. Текст модели и создание subprocess не могут сами установить `Succeeded`.

**Проверка:** для каждого terminal state есть deterministic fixture и видимое сообщение с причиной/evidence.

### F-09. Evidence доступно после завершения

Для task сохраняются request, identifiers, approval, actions, patch summary, command, exit status, verification result и timestamps.

**Проверка:** открыть завершённую task после перезапуска и получить тот же redacted evidence bundle.

### F-10. MVP не зависит от дополнительных продуктов

Основной сценарий работает без cloud accounts, teams, marketplace, browser, IDE, Minecraft, Maker, multi-agent, training, vector RAG и нескольких обязательных providers.

**Проверка:** clean test run не требует запуска этих систем или их development environments.

---

## 2. Reliability Requirements

### R-01. Ошибки не теряют известное состояние

После каждого существенного action сохраняются status и result/error. Ошибка записи, provider, tool или verification не превращается в пустую session.

**Проверка:** fault injection на каждом переходе подтверждает сохранение последнего известного состояния.

### R-02. Неизвестное состояние показывается явно

Если процесс прерван, exit status потерян, storage повреждён или outcome нельзя доказать, task получает `Unknown`/эквивалентное явно документированное состояние.

**Проверка:** timeout/crash fixture не показывает `Succeeded` и не удаляет evidence.

### R-03. Recovery не повторяет side effect молча

После restart/retry Nexus не применяет patch или команду второй раз без нового допустимого action/approval.

**Проверка:** повторить выполнение после interruption и проверить action identifiers, diff и process history.

### R-04. Cancellation имеет наблюдаемый результат

Пользовательская отмена прекращает поддержанное действие или переводит его в `Unknown`, если остановка не доказана. UI и storage показывают итог отмены.

**Проверка:** отменить до write, во время write preparation и во время test process.

### R-05. Storage не маскирует corruption под empty success

Повреждённый или несовместимый state вызывает диагностируемую ошибку/repair path. Nexus не начинает молча новую пустую историю, выдавая её за продолжение.

**Проверка:** повреждённый fixture и неизвестная schema version проходят ожидаемый error path.

### R-06. Перезапуск сохраняет terminal truth

После перезапуска завершённая task не создаётся повторно и не получает другой результат без нового действия.

**Проверка:** restart после success, failure и unknown; сравнить identifiers, statuses и evidence.

### R-07. Один основной provider failure не ломает состояние

Timeout, invalid response или недоступность provider завершаются ошибкой/unknown с сохранённым context и diagnostic record.

**Проверка:** deterministic mock provider faults без сети.

### R-08. Process timeout и output ограничены

Поддержанная test command имеет timeout, exit status и redacted output. Orphan process не считается успешным завершением.

**Проверка:** hanging process, non-zero exit и отсутствующий exit status.

### R-09. Повторяемость основного сценария

Один и тот же fixture при одинаковом input/provider mock приводит к одинаковому terminal state и сопоставимому evidence.

**Проверка:** выполнить сценарий повторно в чистых временных workspace.

---

## 3. Security Requirements

### S-01. Tool permission проверяется до execution

Каждый write/execute action проверяет capability, target и policy до side effect. Registry entry или текст модели не заменяют permission decision.

**Проверка:** deny fixtures для неизвестного tool, неразрешённого path и неразрешённой команды.

### S-02. Approval относится к конкретному действию

Approval содержит target, аргументы/diff summary и command, для которых он выдан. Его нельзя без предупреждения применить к другому action.

**Проверка:** изменить target после approval и убедиться, что действие остановлено.

### S-03. Workspace boundary enforced

Чтение и запись не выходят за разрешённую рабочую область через `..`, symlink, абсолютный внешний path или другой обход.

**Проверка:** traversal/symlink fixtures и попытки изменить неожиданный файл.

### S-04. Secrets защищены при хранении и передаче

API keys, OAuth tokens и другие credentials не хранятся в plaintext messages/config/evidence и не появляются в provider request, logs или tool output.

**Проверка:** secret-marker fixtures, log scan и inspection persisted state.

### S-05. Redaction выполняется до записи evidence

Логи и evidence не полагаются на ручное удаление токенов после публикации. Redaction применяется до persistence/display.

**Проверка:** tool output и provider error с искусственным secret pattern.

### S-06. Audit record нельзя подменить обычным ответом модели

Permission, action, execution и verification states создаются Core/Tool boundary, а не произвольным текстом provider.

**Проверка:** mock provider пытается выдать ложный “done” без action/evidence.

### S-07. Public exposure не подразумевается

Loopback/local MVP не объявляется public API и не использует host/origin check как замену полноценной public authentication.

**Проверка:** release documentation и default binding показывают supported exposure boundary.

### S-08. Unsupported trust boundaries не включены

Plugins, marketplace, browser automation, cloud tenant access, arbitrary connectors и Minecraft account flows не становятся security obligations v1.0.

**Проверка:** dependency/runtime scan и scope review подтверждают отсутствие обязательного запуска этих систем.

---

## 4. Developer Requirements

Один разработчик должен быть способен выполнить эти действия по документации без знания скрытой истории архива.

### D-01. Установка

С чистой поддерживаемой среды разработчик устанавливает зависимости и запускает Nexus по одному документированному пути.

**Доказательство:** clean-install checklist без внешних junctions, архивных абсолютных paths и ручных неописанных исправлений.

### D-02. Запуск

Разработчик запускает основной клиент, создаёт task и выполняет vertical slice с mock provider.

**Доказательство:** команда запуска, минимальная конфигурация и ожидаемый terminal output описаны и воспроизводимы.

### D-03. Конфигурация provider

Разработчик может настроить поддерживаемый provider без записи secret в repository, messages или logs. Mock provider запускается без внешней сети.

**Доказательство:** clean test run и redaction check.

### D-04. Тестирование

Разработчик запускает unit/contract/integration checks основного slice одной документированной командой или коротким набором команд.

**Доказательство:** CI/local result с понятным failed test и artifact/log location.

### D-05. Отладка

При failed/unknown task разработчик может по identifiers найти timeline, action, permission, process и verification evidence без чтения всех исходников.

**Доказательство:** fault fixture и troubleshooting procedure.

### D-06. Обновление

Разработчик может установить новую версию в поддерживаемой среде, сохранить известные данные или получить документированное предупреждение о несовместимости и проверить запуск после обновления.

**Доказательство:** release update/rollback или controlled reinstall checklist для MVP. Отсутствие автоматического updater не должно скрываться; процедура должна быть явной и проверяемой.

### D-07. Изменение без разрушения состояния

Разработчик понимает schema/version markers, backup/repair path и порядок безопасного изменения локального state.

**Доказательство:** migration/repair fixture и rollback instruction.

### D-08. Поддерживаемая среда ограничена явно

Документация перечисляет supported OS/runtime/provider path и известные ограничения. Нельзя заявлять переносимость, которая не проверена.

**Доказательство:** release metadata и clean environment report.

### D-09. Диагностика без cloud operations team

Для MVP не требуется отдельная команда эксплуатации, чтобы понять, почему task завершилась failed или unknown.

**Доказательство:** sanitized diagnostic bundle, локальные logs и инструкция по типовым сбоям.

---

## 5. Release Checklist

### Scope и документация

- [ ] MVP Boundary утверждает только проверенный local-first single-user workflow.
- [ ] Vertical Slice проходит от User Input до Evidence/Result.
- [ ] MUST HAVE закрыты, SHOULD HAVE не блокируют release, NOT NOW не попали в обязательные зависимости.
- [ ] Supported environment и non-goals опубликованы.
- [ ] NexusCLI/Axiom recommendations помечены как решения текущего релиза, а не историческая истина; непринятые вопросы явно записаны.

### Functional verification

- [ ] Session/task/run создаются и сохраняются.
- [ ] Context ограничен workspace и релевантными данными.
- [ ] Mock provider valid/invalid/failure cases проверены.
- [ ] Typed read/patch/test actions проходят schema validation.
- [ ] Approval denial не выполняет side effect.
- [ ] Успешный patch ограничен ожидаемым файлом.
- [ ] Verification проверяет test status и final diff.
- [ ] Evidence доступно после restart.

### Reliability verification

- [ ] Provider timeout/error сохраняет state.
- [ ] Tool failure и non-zero test сохраняют diagnostics.
- [ ] Process timeout/unknown не показывается как success.
- [ ] Cancellation имеет проверяемый terminal result.
- [ ] Crash/restart не создаёт duplicate task или patch.
- [ ] Corrupt/unknown storage version даёт диагностируемый path.
- [ ] Повторяемость fixture подтверждена.

### Security verification

- [ ] Permission проверяется для каждого write/execute action.
- [ ] Approval привязан к target и аргументам.
- [ ] Workspace traversal/symlink cases проверены.
- [ ] Secrets отсутствуют в persisted state, logs, messages, evidence и outputs.
- [ ] Redaction проверена искусственными secret markers.
- [ ] Default exposure остаётся local/loopback согласно документации.
- [ ] Plugins, browser, cloud tenant и unrestricted shell не являются скрытыми dependencies.

### Developer verification

- [ ] Clean install выполнен без архивных junctions и ручных непредусмотренных path fixes.
- [ ] Основной клиент запускается одной документированной процедурой.
- [ ] Mock-provider test run работает без сети.
- [ ] Один разработчик может найти evidence failed/unknown task.
- [ ] Обновление или контролируемая переустановка проверены на поддерживаемой среде.
- [ ] Backup/repair/migration markers проверены на тестовом state.
- [ ] Release logs и diagnostic artifacts не содержат secrets.

### Release decision

Релиз **не готов**, если отсутствует хотя бы одно из следующего:

- успешный полный vertical slice;
- честные `Failed`/`Unknown` состояния;
- permission/approval/evidence для side effects;
- восстановимое каноническое состояние;
- отсутствие secrets в persisted/logged data;
- воспроизводимая clean installation и основная проверка;
- способность одного разработчика диагностировать и обновить систему.

Наличие дополнительных UI, providers, adapters или будущих продуктов не компенсирует провал любого обязательного release gate.
