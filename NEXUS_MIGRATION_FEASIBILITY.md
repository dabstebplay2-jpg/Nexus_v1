# Nexus Migration Feasibility

Дата: 9 сентября 2026 года  
Назначение: оценить, какие исторические проекты реально имеют смысл переносить в Nexus v1.0 при ресурсах одного разработчика.  
Граница: это feasibility review, а не план миграции и не решение о финальной архитектуре.

## Как понимать оценки

**Migration value** — сколько проверенной практической ценности проект может дать Nexus v1.0. Это не оценка размера или общей важности проекта.  
**Migration difficulty** — стоимость переноса с учётом runtime, зависимостей, скрытых связей, данных, тестов и security gaps.  
**Recommended action** — наиболее безопасная форма использования:

- **migrate** — переносить проверенный компонент как часть основного продукта после contract checks;
- **adapt** — взять поведение/модули и подогнать под канонические контракты;
- **wrap with adapter** — оставить проект автономным, подключая его через узкую границу;
- **keep separate** — не связывать с v1.0, но продолжать как отдельный продукт/направление;
- **archive** — не развивать исходный путь; сохранить как reference, regression baseline или источник идей.

Оценки относятся к Nexus v1.0, а не к будущим Studio, Cloud, IDE, Browser или Marketplace.

## Сводная таблица

| Проект | Migration value | Migration difficulty | Recommended action | Краткое основание |
|---|---|---|---|---|
| NexusCLI/nexus | HIGH | HIGH | adapt | Лучший execution path, но Bun, собственные schemas и Agent/Task contracts нельзя перенести механически |
| Axiom | HIGH | MEDIUM | adapt | Лучший chat/UI/storage lifecycle, но Axiom не является Agent Core и его Node boundary нужно сохранить явно |
| Minecraft Launcher | MEDIUM | HIGH | wrap with adapter | Практические runtime/process/download/auth cases, но domain и Windows UI специфичны |
| Old Nexus | MEDIUM | HIGH | archive | Сильный исторический словарь и сценарии, но duplicate paths, security/completion gaps и широкая связность |
| MiniCursor | MEDIUM | HIGH | wrap with adapter | Ценный local inference backend, но CUDA/ML stack hardware-specific и не готов как общий Core |
| Maker | LOW | MEDIUM | keep separate | Самостоятельный visual editor; document/geometry ideas полезны, но продуктовая связь с v1.0 слабая |

---

## 1. NexusCLI/nexus

**Migration value: HIGH**

Это самый сильный источник проверенного task execution behavior. Внутри есть AgentLoop, tool executor, permission engine, recovery policy, evidence/completion policy, durable inbox/action records и SQLite persistence. Эти части ближе всего к основному риску Nexus: не просто получить текст модели, а выполнить ограниченную задачу и объяснить результат.

Ценность относится к standalone `NexusCLI/nexus`, а не ко всему родительскому `NexusCLI`, который также содержит OpenCode reference tree.

**Migration difficulty: HIGH**

- Bun и `bun:sqlite` конфликтуют с Node/Axiom boundary.
- Session и action schemas нельзя считать совместимыми с Axiom.
- AgentLoop предполагает собственные provider turns, events, ownership и recovery semantics.
- Live token/event contract для Web UI не доказан.
- Tests подтверждают внутренние сценарии, но не integration with Axiom, real providers и long-running processes.
- Слишком ранний перенос сохранит скрытые assumptions и сделает Core зависимым от runtime-specific APIs.

**Recommended action: adapt**

Взять поведение и проверенные контракты как исходный execution reference, затем подогнать их под согласованные Core session, tool, event, storage и security boundaries. Не переносить весь repository или OpenCode packages. Такой путь сохраняет сильные guarantees и ограничивает риск механического копирования Bun-specific деталей.

**Что подтверждает решение:** выбранный test run 46/46, coherent AgentLoop composition и наличие completion/evidence/recovery.  
**Что может заблокировать:** отсутствие согласованного host runtime, event protocol и data migration contract.

---

## 2. Axiom

**Migration value: HIGH**

Axiom — наиболее цельный источник chat lifecycle, provider registry, context policy, message parts, cancellation/partial persistence, SQLite migrations, Express loopback API и React chat client. Он закрывает пользовательский путь, который NexusCLI сам по себе не предоставляет.

Ценность особенно высока для client/storage behavior, но не означает, что Axiom ChatCore автоматически умеет tools или autonomous tasks.

**Migration difficulty: MEDIUM**

- Node.js и `node:sqlite` требуют явного отношения к Bun/Agent storage.
- Chat events и Agent activity имеют разные states и completion semantics.
- UI потребует approvals, tools, evidence, retries и unknown state.
- Архивные workspace links указывают на внешние `C:\Axiom\...` paths; чистая переносимость не доказана.
- Provider registry рассчитан на chat capabilities, а не обязательно на tool calls и durable task execution.

Сложность ниже, чем у Minecraft или старого Nexus, потому что границы packages и migrations уже выражены, а scope сознательно ограничен чатом.

**Recommended action: adapt**

Сохранить Axiom как источник chat/storage/UI behavior и адаптировать его transport, events и storage к согласованным Nexus contracts. Не переносить cloud-coupled screens и не объявлять ChatCore заменой AgentLoop. Если клиент выбирается один на MVP, Web UI можно подключать после доказательства основного task path.

**Что подтверждает решение:** выбранный test run 32/32 после локального исправления workspace links; docs по storage/context/security; явное ограничение scope.  
**Что может заблокировать:** попытка сделать один loop без отдельной chat/task semantics или сохранить два независимых SQLite sources of truth.

---

## 3. Minecraft Launcher

**Migration value: MEDIUM**

Minecraft даёт реальные, а не только теоретические случаи для DownloadManager, InstanceManager, Java/runtime discovery, process launch, OAuth lifecycle, updater и progress UI. Эти случаи полезны при проверке generic contracts и выявлении ошибок stateful systems.

Для Nexus v1.0 ценность ниже, чем у NexusCLI/Axiom: Minecraft-specific loaders, `.minecraft` layout, Mojang/Xbox/Ely auth, Modrinth и Windows installer не нужны основному local coding workflow.

**Migration difficulty: HIGH**

- Две копии launcher имеют разный maturity и data shape.
- Python/PySide6/Windows/Java stack не совпадает с TypeScript Core.
- DownloadManager — persistent JSON ledger, а не универсальный downloader; нет multi-process lock, schema migration, cancellation/resume и durable event log.
- VersionManager — thin retry wrapper без полноценного cache/offline policy.
- InstanceManager использует JSON и absolute paths.
- Launcher монолитно объединяет install, auth, filesystem, Java, Popen и UI callbacks.
- OAuth tokens хранятся plaintext; updater допускает путь без внешнего checksum.
- Live GUI, network OAuth и Popen lifecycle в текущем окружении не проверялись.

**Recommended action: wrap with adapter**

Оставить launcher самостоятельным domain/client и подключать только узкими, проверяемыми интерфейсами, если это потребуется. Его modules использовать как test cases и reference behavior для jobs, runtime и process contracts. Не переносить PySide6, Minecraft protocol, plaintext token storage, permissive updater или monolithic Launcher в Nexus Core.

Основной источник для Minecraft-направления — новая копия `Nexus_Minecraft/Nexus_Minecraft`; `Nexus_minecraft_launcher` сохраняется как baseline, а не как второй migration source.

**Что подтверждает решение:** новая копия шире старой и имеет CI/security checks, но stateful core покрыт неполно.  
**Что может заблокировать:** попытка сделать Minecraft первым универсальным runtime case; это принесёт Python/Windows/domain complexity до доказательства Core.

---

## 4. Old Nexus

**Migration value: MEDIUM**

Старый Nexus содержит широкий опыт: role-oriented planning, dependency graphs, orchestration scenarios, activity vocabulary, CLI diagnostics, model/tool/memory experiments и regression cases. Это полезно как reference при формулировании problem space и проверке того, какие идеи уже пробовали.

Ценность — в исторических сценариях и наблюдениях, а не в готовности существующего runtime стать новой основой.

**Migration difficulty: HIGH**

- Duplicate CLI, execution и sandbox paths усложняют установление canonical behavior.
- Старые документы описывают состояния, которые не всегда совпадают с текущим кодом.
- Security check может записывать audit, не блокируя execution.
- Runtime может выставлять `COMPLETED` после orchestration без независимого evidence.
- Legacy text-to-action extraction опасна как generic tool protocol.
- In-process Database/VectorMemory не доказывают durable storage или настоящий vector retrieval.
- Широкая Python dependency surface и unclear compatibility aliases затрудняют изоляцию компонентов.

**Recommended action: archive**

Сохранить код и документацию read-only как исторический reference, regression baseline и источник сценариев. Переносить только отдельно подтверждённые идеи через новые tests/contracts, а не вытаскивать runtime по частям в Core. Это минимизирует вероятность занести старые security и completion flaws.

**Что подтверждает решение:** выбранные тесты (29 passed) не закрывают критические execution/security gaps.  
**Что может заблокировать:** попытка «починить по дороге» сразу несколько старых entry points вместо ограниченной миграции доказанного поведения.

---

## 5. MiniCursor

**Migration value: MEDIUM**

MiniCursor показывает практический local GGUF/llama.cpp path, model discovery, configuration и hardware preparation. Это может дать полезный provider/backend experience для offline сценария и hardware diagnostics.

Ценность не равна готовности training pipeline или agent directories. Для базового Nexus workflow можно обойтись одним remote/mock provider и не включать GPU stack.

**Migration difficulty: HIGH**

- CUDA, llama.cpp native bindings, VRAM и model files делают поведение hardware-dependent.
- Inference и QLoRA training имеют разные lifecycle и dependencies.
- Selected tests имеют 24 passed и 4 failures по thinking contract.
- `agent`, `memory` и `tools` не доказаны как связанный production path.
- Local model capability может отличаться от OpenAI-compatible tool/stream contract.
- Большой ML dependency graph усложнит install, CI и release для одного разработчика.

**Recommended action: wrap with adapter**

Оставить MiniCursor отдельным local inference backend и, при необходимости, подключать через узкий provider adapter с явными capability limits. Не переносить training, fixed-plan agent router, простую JSON memory или CUDA dependencies в базовый Core.

**Что подтверждает решение:** есть реальный backend/runtime/config structure и hardware tests.  
**Что может заблокировать:** обещание provider interchangeability без capability tests или попытка сделать CUDA environment обязательным для всех пользователей Nexus.

---

## 6. Maker

**Migration value: LOW**

Maker — полноценный самостоятельный visual editor с document format, project IO, coordinates, scene graph, layout и local persistence. Эти идеи могут быть полезны позже для document-centric clients, но не необходимы для первого local assistant/task workflow.

**Migration difficulty: MEDIUM**

- React/Zustand/browser state tightly coupled to editor UI.
- `.nexus` document migrations и localStorage относятся к editor domain.
- Известен grouping/reparenting defect: созданная group не принимается scene graph как parent.
- Перенос editor store или canvas в Core добавит большую client surface без пользы для основного MVP.

**Recommended action: keep separate**

Продолжать рассматривать Maker как самостоятельное направление и источник document/geometry testing practices. Не связывать его с обязательным Nexus Core, пока не появится подтверждённый пользовательский сценарий, которому нужен visual editor.

**Что подтверждает решение:** document format и тесты реально существуют, но продуктовая граница отдельная.  
**Что может заблокировать:** использование Maker как аргумента для раннего Nexus Studio; это расширит scope до стабилизации базового execution path.

---

## Общие выводы по feasibility

### Самая высокая ценность

NexusCLI и Axiom дают взаимодополняющие, но не взаимозаменяемые части: execution и chat/storage/UI. Их следует адаптировать вокруг согласованных contracts, а не механически объединять repositories.

### Самая высокая стоимость риска

Minecraft и MiniCursor требуют adapter boundary из-за платформы, внешних сервисов и runtime-specific behavior. Старый Nexus требует archive discipline из-за дублирования и security/completion gaps.

### Что не следует считать миграцией

Перенос README, названий модулей, тестовых файлов или registry entries без переноса их invariants, error semantics, security policy и данных не является миграцией компонента.

### Минимальная проверка перед любым переносом

Для каждого выбранного фрагмента должны быть отдельно подтверждены: входы/выходы, side effects, cancellation, error states, persistence, secret handling, versioning и tests в чистом окружении. Без этих доказательств recommendation остаётся только оценкой feasibility.

## Итоговая рекомендация

При ресурсах одного разработчика наиболее безопасная граница такова: **адаптировать NexusCLI и Axiom; подключать Minecraft и MiniCursor только через adapters; Old Nexus архивировать; Maker оставить отдельным**. Это не утверждение финальной архитектуры, а оценка того, где перенос создаёт ценность, а где стоимость и риск выше практической пользы для v1.0.
