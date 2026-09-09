# Nexus v1.0 — MVP Boundary

Дата: 9 сентября 2026 года  
Назначение: зафиксировать минимальный объём, который один разработчик может закончить, протестировать и поддерживать.  
Ограничение: это граница продукта, а не финальная архитектура. Она не выбирает Bun/Node, конкретную схему пакетов или способ миграции.

## Принцип границы

Nexus v1.0 должен быть небольшим, законченным local-first продуктом для одного пользователя. Он должен принять задачу, безопасно выполнить ограниченный набор действий, показать ход работы, сохранить состояние и доказать результат. Всё, что требует отдельной cloud-платформы, marketplace, нескольких клиентов, сложной координации или нескольких новых trust boundaries, не должно блокировать первый релиз.

Критерий включения: функция необходима для основного сценария **запрос → действие → проверка → результат → восстановление** и может быть поддержана одним разработчиком. Наличие прототипа в архиве само по себе не является основанием для включения.

---

## MUST HAVE — обязательно до Nexus v1.0

### 1. Один завершённый local-first пользовательский сценарий

**Граница:** один пользователь запускает Nexus локально, создаёт сессию, формулирует задачу, получает ответ или выполняет ограниченное действие и видит итог.

**Почему входит:** без сквозного сценария отдельные Agent Core, UI, tools и storage не образуют продукт. Local-first уменьшает deployment, billing, tenancy и support burden для одного разработчика.

**Ограничение:** multi-user, account teams, cloud sync и публичный сервис в этот сценарий не входят.

### 2. Один канонический execution path

**Граница:** для задач с side effects существует один AgentLoop/task lifecycle с понятными состояниями: accepted, running, waiting/approval, succeeded, failed, cancelled или unknown.

**Почему входит:** две конкурирующие реализации быстро расходятся по cancellation, retry, evidence и completion. NexusCLI уже содержит наиболее проверенную основу execution path; она должна быть использована как источник поведения, но не объявляется автоматически готовым объединённым Core.

**Ограничение:** legacy runtime, cloud loop и Minecraft Launcher не становятся альтернативными агентскими ядрами.

### 3. Явное разделение обычного чата и задачи

**Граница:** чат без side effect и задача с tools имеют различимые режимы, permissions и критерии завершения.

**Почему входит:** обычный текстовый ответ нельзя считать доказательством изменения файла или запуска процесса. Это основная защита от ложного успеха.

**Ограничение:** не требуется отдельный autonomous multi-agent mode.

### 4. Один основной пользовательский клиент

**Граница:** до релиза поддерживается один основной интерфейс с полным lifecycle. Он должен показывать запрос, ответ, состояние задачи, запрос разрешения, ошибки и результат.

**Почему входит:** одновременно доводить CLI, Web UI, PySide6, IDE и browser одному разработчику нереалистично. Один клиент снижает число event/API compatibility paths.

**Практическая форма MVP:** предпочтительно CLI как наиболее короткий путь к проверяемому task workflow. Axiom Web UI остаётся кандидатом на SHOULD HAVE до тех пор, пока не доказано, что его transport и event contract не удваивают объём поддержки.

**Ограничение:** второй клиент не должен быть условием готовности v1.0.

### 5. Ограниченный набор безопасных tools

**Граница:** только необходимые для основного coding/task сценария инструменты с typed schema, validation, capability/permission check, timeout, redacted result и audit record. Минимальный набор: чтение файлов, запись файлов в разрешённой рабочей области и явно контролируемая проверка/команда.

**Почему входит:** без side-effect tools Nexus остаётся чат-оболочкой. Ограниченный набор можно реально проверить; произвольный shell, browser, connector и plugin surface проверить одному разработчику нельзя.

**Ограничение:** legacy regex actions, неявное выполнение инструкций из текста модели и неограниченный доступ к файловой системе запрещены.

### 6. Permission и approval перед опасным действием

**Граница:** пользователь видит, какое действие, над каким target и с какими аргументами будет выполнено; policy может разрешить, запретить или потребовать подтверждение. Решение записывается вместе с вызовом.

**Почему входит:** tools изменяют файлы и процессы. Без связи approval с конкретным side effect невозможно доказать безопасность и восстановить спорный случай.

**Ограничение:** не требуется полноценная multi-tenant RBAC система.

### 7. Проверяемое завершение и evidence

**Граница:** итоговая задача не получает статус success только из текста модели или возврата orchestrator. Должны сохраняться действие, результат проверки, ошибка или причина unknown.

**Почему входит:** это главное отличие полезного агента от демо. Без evidence пользователь не знает, было ли действие выполнено.

**Ограничение:** verification ограничивается поддержанными сценариями; нельзя обещать доказательство произвольной семантической цели.

### 8. Отмена, ошибка и безопасное восстановление

**Граница:** пользователь может отменить задачу; timeout и crash не маскируются под success; после перезапуска состояние не должно бесшумно исчезать.

**Почему входит:** ошибки сети, provider и tools неизбежны. Минимальная recovery semantics нужна уже для первого реального пользователя.

**Ограничение:** сложные распределённые workflow и гарантированное продолжение любого внешнего side effect не входят; для неподтверждённого результата используется явный unknown/manual recovery.

### 9. Одно каноническое локальное хранилище состояния

**Граница:** sessions, messages, task state, actions, permissions и evidence имеют единый источник истины с versioned migrations, transaction boundaries и backup/repair behavior.

**Почему входит:** раздельные SQLite/JSON ledgers уже показывают риск расхождения. Для одного разработчика проще поддерживать одну проверенную persistence boundary, чем синхронизировать несколько stores.

**Ограничение:** binary model weights, secrets и большие файлы не обязаны храниться внутри той же таблицы; их связь с состоянием должна быть явной.

### 10. Один реально поддерживаемый model provider contract

**Граница:** один provider path должен поддерживать нужные для MVP text generation, structured/tool call behavior, timeout, cancellation и ошибки. Mock provider используется для воспроизводимых тестов.

**Почему входит:** без реальной модели основной сценарий не проверяется; без mock provider тесты будут зависеть от сети и стоимости.

**Ограничение:** наличие нескольких registry в архиве не означает обязательную поддержку всех провайдеров. Provider capability, а не название API, является критерием.

### 11. Секреты не хранятся открытым текстом

**Граница:** API keys и refresh tokens не попадают в messages, logs, evidence или plaintext account JSON. Должен быть один поддерживаемый безопасный способ локальной конфигурации и redaction.

**Почему входит:** утечка ключа делает локальный продукт неприемлемым независимо от качества AgentLoop.

**Ограничение:** cloud secret manager и корпоративная rotation platform не требуются для single-user MVP.

### 12. Базовые process boundaries для поддержанных операций

**Граница:** если MVP запускает внешнюю команду, он должен хранить command identity, timeout, stdout/stderr policy, exit status и cancellation result. Нельзя считать запуск `Popen` завершённым process management.

**Почему входит:** coding tasks часто зависят от проверок и команд. Без состояния процесса Core будет выдавать ложный результат и оставлять orphan processes.

**Ограничение:** Minecraft JVM, model servers, browser processes и универсальная cross-platform supervisor platform не обязательны.

### 13. Минимальная наблюдаемость и безопасная диагностика

**Граница:** structured logs и task timeline позволяют восстановить, что произошло, с correlation ID и redaction.

**Почему входит:** один разработчик не сможет исправлять редкие сбои без воспроизводимой истории; обычный stdout недостаточен.

**Ограничение:** полноценная distributed tracing/metrics platform не нужна.

### 14. Автоматические проверки основного сценария

**Граница:** tests покрывают chat/task lifecycle, tool permission, success/failure/unknown, cancellation, storage migration, secret redaction и provider mock contract. Есть clean install/build check.

**Почему входит:** исторические passing tests по отдельным проектам не доказали интеграцию. MVP должен иметь доказательство именно своего сквозного поведения.

**Ограничение:** live OAuth, CUDA, GUI E2E и все внешние services можно вынести в отдельные optional checks, если они не входят в основной сценарий.

### 15. Явные non-goals и воспроизводимая поставка

**Граница:** документация фиксирует supported OS/runtime/install path, ограничения продукта и известные unsupported cases. Установка из чистого окружения повторяема.

**Почему входит:** один разработчик не может поддерживать продукт, чьи границы известны только из истории чата или локальной машины.

**Ограничение:** не требуется поддерживать все платформы и все архивные конфигурации.

---

## SHOULD HAVE — после первого релиза

Эти пункты полезны, но не должны блокировать первую действительно законченную версию.

### 1. Axiom Web UI как второй клиент

**Почему после релиза:** Axiom даёт сильную основу chat UI и storage lifecycle, но подключение к Agent events, approvals, evidence и reconnect потребует отдельной проверки. Второй клиент удваивает surface тестирования.

### 2. Поддержка нескольких model providers

**Почему после релиза:** полезна для выбора цены, privacy и доступности, но каждый provider меняет streaming, tool calls, limits и error semantics. Сначала нужен один доказанный contract.

### 3. Локальные модели MiniCursor/llama.cpp

**Почему после релиза:** local inference ценен для offline/privacy сценариев, но зависит от CUDA, native binaries, VRAM, model files и hardware. Он не должен блокировать provider-neutral MVP.

### 4. Ограниченный profile/context memory

**Почему после релиза:** простой profile и task context могут улучшить полезность, но требуют retention, provenance, correction, deletion и prompt-budget policy. Полезность не оправдывает неопределённую общую `memory` таблицу.

### 5. Более глубокое восстановление долгих процессов

**Почему после релиза:** базовая cancellation/unknown обязательна, но полное reconcile после перезапуска, process trees и restartable jobs требуют platform-specific тестов.

### 6. Удобные importers старых данных

**Почему после релиза:** сохранение истории важно, но импорт нескольких SQLite/JSON схем до определения canonical data contract опаснее, чем чистый старт. Importer должен иметь отдельные fixtures и rollback.

### 7. Signed updater и portable release improvements

**Почему после релиза:** production-grade update trust важен, но updater не должен становиться частью первой task loop. До его готовности релиз можно распространять контролируемо и явно ограниченно.

### 8. Отдельные domain adapters

**Почему после релиза:** Minecraft runtime, Java discovery, Modrinth, Maker document tools и cloud connectors могут быть полезны конкретным пользователям, но не нужны для доказательства общего Nexus workflow.

### 9. Расширенная диагностика и operator export

**Почему после релиза:** экспорт sanitized evidence и более подробные metrics полезны при росте пользователей, но базовый redacted timeline уже закрывает MVP debugging need.

### 10. Дополнительные UI polish и client parity

**Почему после релиза:** темы, сложные dashboards, rich activity views и parity между клиентами улучшают UX, но не доказывают correctness execution.

---

## NOT NOW — запрещено включать до v1.0

Эти пункты не должны появляться в MVP backlog, кроме отдельной формальной отмены границы.

### 1. Cloud-first Nexus, billing и teams

**Почему не входит:** добавляют tenancy, public auth, billing, data residency, sync, roles, support и operational SLO. Это отдельный продуктовый и security scope для одной команды.

### 2. Marketplace и произвольная plugin ecosystem

**Почему не входит:** plugins требуют signing, capability isolation, compatibility, malicious package review, version policy и rollback. Наличие plugin folders в старых проектах не доказывает готовую trust boundary.

### 3. Multi-agent orchestration

**Почему не входит:** умножает context routing, budgets, permissions, cancellation, evidence и failure recovery до того, как доказан один надёжный агентский workflow.

### 4. Полноценная IDE

**Почему не входит:** Code-OSS/VSCodium, language servers, terminal, workspace trust, extensions и packaging — отдельная большая платформа. CLI task loop не требует её для первого законченного продукта.

### 5. AI Browser и browser automation

**Почему не входит:** cookies, downloads, accounts, prompt injection и irreversible web actions создают отдельную high-risk boundary.

### 6. Nexus Studio как объединённая оболочка всех направлений

**Почему не входит:** Studio потребует одновременной поддержки chat, tasks, IDE, browser, Maker, models и cloud. Это форма интерфейса над ещё не доказанными контрактами, а не MVP necessity.

### 7. Minecraft Launcher внутри Nexus Core

**Почему не входит:** Minecraft имеет собственные loaders, Java rules, accounts, modpacks, instances, updater и Windows UI. Его можно развивать как отдельный client/domain, но его детали не должны определять Core.

### 8. Training platform и собственная языковая модель

**Почему не входит:** `Create_my_AI_NEXUSAI` и MiniCursor training stack требуют datasets, GPU, checkpoints, evaluation и отдельного release cycle. Это не условие полезности assistant v1.0.

### 9. Vector RAG как обязательная memory feature

**Почему не входит:** retrieval, embeddings, index migrations, provenance, deletion и privacy ещё не доказаны. Наличие `VectorMemory` в старом Nexus недостаточно.

### 10. Поддержка нескольких host runtimes одновременно

**Почему не входит:** Bun/Node и связанные SQLite/process/package differences уже создают конфликт. Один разработчик не должен обещать равноправную поддержку двух runtime до появления измеренной необходимости.

### 11. Универсальный cross-platform launcher и runtime manager

**Почему не входит:** Windows Minecraft Java discovery, local model CUDA и generic process management имеют разные platform contracts. Обещание «работает везде» расширит тестовую матрицу сверх доступных ресурсов.

### 12. Полная совместимость со всеми legacy проектами

**Почему не входит:** старые schemas, CLI paths, JSON formats, providers и security assumptions противоречат друг другу. Совместимость без fixtures и rollback закрепит технический долг навсегда.

### 13. Публичный API и внешний SDK

**Почему не входит:** public API требует auth, rate limits, versioning, abuse controls, tenancy и support promises, которых не требует local MVP.

### 14. Автоматическое выполнение неявных действий из текста модели

**Почему не входит:** это прямая security и correctness regression относительно typed tools и explicit approval.

---

## Граница готовности MVP

Nexus v1.0 можно считать готовым только если одновременно выполняются следующие условия:

1. Чистая установка запускается в одной поддерживаемой среде.
2. Один пользователь может пройти полный сценарий от запроса до проверенного результата.
3. Каждое side effect действие имеет typed call, permission decision и audit/evidence record.
4. Ошибки, отмена и неизвестное состояние не маскируются под успех.
5. Перезапуск не уничтожает каноническое состояние сессии или задачи.
6. Секреты не появляются в logs, messages, evidence или plaintext storage.
7. Основной сценарий проходит автоматические тесты без live provider dependency.
8. Документация прямо перечисляет unsupported features из NOT NOW.

Если хотя бы один пункт не выполнен, добавление Web UI, local models, Minecraft, plugins или cloud не делает продукт ближе к v1.0. Оно только увеличивает поверхность отказа.

## Финальная граница для одного разработчика

MVP — это не маленькая версия всей экосистемы. Это один надёжный local-first workflow с ограниченными tools, понятным evidence и восстановимым состоянием. Axiom, MiniCursor, Nexus Minecraft, cloud, Maker, IDE, browser и legacy Nexus остаются источниками отдельных компонентов и знаний, но не становятся обязательными одновременно.
