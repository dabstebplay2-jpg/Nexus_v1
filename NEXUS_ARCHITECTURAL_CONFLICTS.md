# Nexus Architectural Conflicts

Дата: 9 сентября 2026 года  
Назначение: перечень мест, где прямое объединение исторических проектов может привести к несовместимости.  
Статус: подготовка решений для Principal Architect; этот документ **не является архитектурой Nexus v1.0**.

## Как читать реестр

Отчёты содержат три разных вида утверждений:

- **FACT FROM CODE** — наблюдение по файлам, тестам или конфигурации;
- **AUDIT FINDING** — вывод после сопоставления нескольких фактов;
- **ASSUMPTION** — рабочая гипотеза, которую ещё нужно проверить;
- **RECOMMENDATION** — вариант для обсуждения, а не принятое решение.

Несколько формулировок первого аудита были намеренно предварительными. Например, старый отчёт называл CLI старого Nexus неподключённым, а глубокий анализ показал, что текущий путь уже собирает runtime и executor. Это не изменение исходного кода, а исправление уровня уверенности в документации.

## 1. NexusCLI Agent Core против Axiom Chat System

**Problem:** два проекта используют слово Core, но решают разные задачи.

**Current solutions:**

- **FACT FROM CODE:** `NexusCLI/nexus` содержит AgentLoop, tool execution, permission engine, recovery, evidence/completion policy, SQLite ledger и OpenAI-compatible provider.
- **FACT FROM CODE:** Axiom содержит ChatCore, provider registry, контекст, генерацию/отмену, SQLite persistence, Express API и React chat UI; README прямо ограничивает scope отсутствием agents/tools/MCP/RAG.
- **AUDIT FINDING:** NexusCLI сильнее как исполнитель задач, Axiom — как чатовый lifecycle и UI.

**Why simple merge fails:** Chat turn и task turn имеют разные состояния, права, длительность, cancellation semantics и критерии завершения. Если считать обычный ответ чата доказательством выполнения, появится ложное завершение. Если все чаты прогонять через task ledger, UI и модель станут излишне сложными.

**Possible solutions:**

1. Два явно названных application mode поверх согласованных базовых контрактов.
2. Общие только session/context/event primitives, а AgentLoop и ChatCore оставить отдельными сервисами.
3. Полное объединение loop-ов после доказательства, что state machine и completion semantics совместимы.

**Question for GPT-6:** где проходит граница между Chat, Task и будущим Agent mode, и какие состояния являются общими?

## 2. Bun против Node.js

**Problem:** NexusCLI использует Bun, Axiom — Node.js; оба используют SQLite, но разные runtime APIs.

**Current solutions:**

- **FACT FROM CODE:** NexusCLI импортирует `bun:sqlite`, запускается через Bun и имеет Bun-тесты.
- **FACT FROM CODE:** Axiom использует `node:sqlite`, npm workspaces и Node test runner/tsx.
- **AUDIT FINDING:** тесты каждого проекта проходят в собственном окружении, но это не доказывает cross-runtime совместимость.

**Why simple merge fails:** меняются SQLite driver, stream/process APIs, module resolution, packaging, CLI launchers и native dependencies. Простая замена импорта может изменить transaction behavior и тестовые гарантии.

**Possible solutions:**

1. Выбрать один host runtime и адаптировать второй storage/process layer.
2. Сохранить runtime-specific adapters при едином доменном API.
3. Разделить executable packages и обмениваться только HTTP/IPC contracts.

**Question for GPT-6:** какой runtime является обязательной платформой Nexus v1.0 и как будет измерена стоимость адаптации?

## 3. SQLite schemas и миграции

**Problem:** несколько SQLite-схем хранят похожие сущности: sessions, messages, actions, providers, settings и jobs.

**Current solutions:**

- **FACT FROM CODE:** NexusCLI имеет WAL, foreign keys, `synchronous=FULL`, busy timeout, optimistic version, action journal и inbox; session частично хранится JSON.
- **FACT FROM CODE:** Axiom имеет versioned migrations, message parts и восстановление `generating -> aborted`.
- **FACT FROM CODE:** облачный проект использует SQLAlchemy/свою серверную БД и не является локальной схемой NexusCLI.
- **FACT FROM CODE:** Minecraft использует JSON для downloads, instances, accounts и settings.

**Why simple merge fails:** одинаковые имена не означают одинаковую семантику. Прямая склейка создаст несовместимые IDs, timestamps, ownership, migration versions и transaction boundaries; JSON абсолютные пути Minecraft нельзя считать переносимой общей схемой.

**Possible solutions:**

1. Новый canonical schema с импортерами из каждой истории.
2. Отдельные bounded stores с versioned adapters.
3. Единый store только для общих entities, domain data оставить в plugin tables.

**Question for GPT-6:** какие данные являются обязательными в Core, а какие должны мигрироваться как доменные расширения?

## 4. Memory systems

**Problem:** под словом memory скрываются разные функции.

**Current solutions:**

- **FACT FROM CODE:** Axiom имеет conversation persistence и context policy.
- **FACT FROM CODE:** NexusCLI хранит session history, context manager, action/evidence records и durable inbox.
- **FACT FROM CODE:** старый Nexus содержит in-process memory и `VectorMemory`, чей search не доказывает настоящего vector retrieval.
- **FACT FROM CODE:** MiniCursor хранит простую JSON memory; cloud проект имеет user profile/SQL memory.

**Why simple merge fails:** история сообщений, рабочий контекст задачи, профиль пользователя, retrieval index и transient cache имеют разные retention, privacy и consistency requirements. Таблица `memory` без типов приведёт к утечке контекста и неконтролируемому росту.

**Possible solutions:**

1. Разделить conversation log, task context, user profile, retrieval index и cache.
2. На v1.0 оставить только доказанные durable stores и отложить vector/RAG.
3. Ввести memory provider contract с явной policy и provenance.

**Question for GPT-6:** какие классы памяти входят в v1.0 и кто управляет сроком хранения/удалением?

## 5. Tool protocols

**Problem:** инструменты представлены несколькими несовместимыми механизмами.

**Current solutions:**

- **FACT FROM CODE:** NexusCLI имеет typed tool registry, permission engine, executor, results и recovery.
- **FACT FROM CODE:** старый Nexus имеет registry/executor и местами извлекает действия regex-ами из текста модели.
- **FACT FROM CODE:** Axiom ChatCore не является tool executor.
- **FACT FROM CODE:** cloud loop выполняет ограниченные connector tool turns без durable local ledger.

**Why simple merge fails:** текстовые маркеры, function calls, connector calls и локальные side effects имеют разные trust boundaries. Нельзя превращать произвольный текст модели в запись файла или shell action и считать это безопасным typed protocol.

**Possible solutions:**

1. Один typed tool contract с schema, capability, approval, timeout, result и audit metadata.
2. Разные adapters для local tools, connector tools и game tools поверх общего envelope.
3. Оставить legacy text actions только в импортном/совместимом режиме.

**Question for GPT-6:** какой протокол является каноническим и как он предотвращает confused-deputy и replay?

## 6. Provider systems

**Problem:** Axiom, NexusCLI, cloud и MiniCursor имеют собственные реестры моделей и provider adapters.

**Current solutions:**

- **FACT FROM CODE:** Axiom ProviderRegistry поддерживает OpenAI-compatible и mock providers.
- **FACT FROM CODE:** NexusCLI provider умеет turns, tool calls и streaming parts, но отдельный live token event contract ещё не оформлен.
- **FACT FROM CODE:** MiniCursor отделяет local GGUF/llama.cpp inference и training.
- **FACT FROM CODE:** cloud registry связан с аккаунтами, тарифами и connector access.

**Why simple merge fails:** local model discovery, remote API credentials, billing entitlements and agent tool-call semantics нельзя смешать в один provider class. Различаются streaming, context limits, retries, privacy and secret ownership.

**Possible solutions:**

1. Канонический model/provider capability contract с отдельными transport/auth adapters.
2. Local inference и cloud providers как разные packages.
3. Cloud registry оставить за cloud boundary, синхронизируя только публичный catalog.

**Question for GPT-6:** что означает “model” в Core: endpoint, runtime, catalog item, account binding или всё это отдельными сущностями?

## 7. Event streaming

**Problem:** UI ожидает поток генерации и прогресса, а AgentLoop и Minecraft workers используют другие события.

**Current solutions:**

- **FACT FROM CODE:** Axiom API использует NDJSON/chat events и partial persistence.
- **FACT FROM CODE:** NexusCLI собирает provider parts до записи assistant; общего live token-delta API для Web UI не доказано.
- **FACT FROM CODE:** Minecraft DownloadManager хранит progress snapshots, а UI workers обновляют QThread callbacks.

**Why simple merge fails:** token delta, tool progress, download progress, approval request, process output и final evidence нельзя передавать одним нетипизированным сообщением. Потеря события после reconnect и порядок событий имеют разные последствия.

**Possible solutions:**

1. Versioned event envelope с sequence, correlation ID, replay/ack policy и typed payloads.
2. Отдельные streams для generation, task activity, jobs и process output.
3. HTTP SSE/NDJSON/WebSocket adapters над внутренним event bus.

**Question for GPT-6:** какие события durable, какие ephemeral, и как клиент восстанавливается после разрыва?

## 8. API boundaries

**Problem:** существует in-process NexusAPI, loopback HTTP Axiom, cloud FastAPI, локальный IDE proxy и PySide6 callbacks.

**Current solutions:**

- **FACT FROM CODE:** NexusCLI `src/api.ts` — TypeScript API внутри процесса.
- **FACT FROM CODE:** Axiom Express API рассчитан на loopback и проверяет host/origin/client header.
- **FACT FROM CODE:** cloud API решает auth/billing/connectors и не равен local Core API.
- **FACT FROM CODE:** Minecraft UI вызывает core objects напрямую.

**Why simple merge fails:** local API, public API и UI facade имеют разные auth, versioning, latency and failure models. Экспорт cloud API в Core протащит аккаунты и billing; экспорт PySide callbacks в Web UI сделает boundary UI-dependent.

**Possible solutions:**

1. Чётко разделить domain API, local transport и public/cloud API.
2. Описывать transport contracts отдельно от application services.
3. Генерировать typed client contracts и contract tests.

**Question for GPT-6:** какой API должен быть стабильным в v1.0 и где проходят trust boundaries?

## 9. Runtime management и process lifecycle

**Problem:** проекты управляют разными видами процессов: model runtime, agent tools, Minecraft JVM, updater и local servers.

**Current solutions:**

- **FACT FROM CODE:** Minecraft Java Manager обнаруживает Java и проверяет major/version manifest, а Launcher напрямую создаёт `Popen`.
- **FACT FROM CODE:** NexusCLI запускает инструменты через собственный executor и recovery.
- **AUDIT FINDING:** общий process supervisor в архиве не доказан.

**Why simple merge fails:** Java discovery не равен управлению процессом агента; PID без creation identity и persisted handle не переживает restart; process tree, stdout/stderr, cancellation and cleanup отличаются по платформам.

**Possible solutions:**

1. Общий supervisor contract (`start`, `observe`, `cancel`, `kill`, `reconcile`) с platform adapters.
2. Отдельные supervisors для tools, model servers и game processes.
3. Для v1.0 поддержать только один класс long-running process и явно отложить остальные.

**Question for GPT-6:** какие процессы обязаны переживать перезапуск Core, и какой уровень изоляции требуется?

## 10. Security models

**Problem:** security controls различаются по проектам и местами являются только декларацией.

**Current solutions:**

- **FACT FROM CODE:** NexusCLI PermissionEngine, approvals, tool capabilities, redaction and verification — наиболее целостный local path.
- **FACT FROM CODE:** старый Nexus записывает security check в audit, но текущий execution path не доказывает отказ/approval gate; completion может выставляться после orchestration.
- **FACT FROM CODE:** Minecraft хранит OAuth tokens в открытых JSON и допускает update без внешнего checksum, если asset отсутствует.
- **FACT FROM CODE:** Axiom loopback host/origin checks не являются public authentication.

**Why simple merge fails:** разные threat models (локальный пользователь, cloud tenant, downloaded plugin, game account) требуют разных trust boundaries. Одна “SecurityGate” не закрывает secrets at rest, filesystem traversal, tool authorization, update authenticity и network exposure.

**Possible solutions:**

1. Общие security primitives плюс threat model для каждого boundary.
2. Capability/approval policy для tools, OS secret backend, signed releases и network allowlists.
3. Исключить cloud/plugin/update concerns из local Core до отдельного ADR.

**Question for GPT-6:** какие угрозы являются release blockers для v1.0 и какие evidence нужны для их закрытия?

## Дополнительные конфликтные места

### Две копии Nexus_Minecraft

Новая `Nexus_Minecraft/Nexus_Minecraft` (v1.1.4.2) функционально шире; `Nexus_minecraft_launcher` (v0.7.13) полезна как исторический baseline. Выбор новой копии как основной — **AUDIT FINDING/RECOMMENDATION**, а не доказательство release readiness. Незакоммиченные website/build изменения и неполное покрытие stateful core требуют проверки перед любым переносом.

### NexusCLI и родительский OpenCode snapshot

Папка `NexusCLI` содержит самостоятельный `nexus` и большой OpenCode reference tree. Название родительской папки не доказывает, что весь OpenCode является кодом Nexus. Прямое копирование пакетов принесёт чужие lifecycle, licensing, runtime и protocol assumptions.

### Cloud, IDE, Browser и desktop clients

`Nexus_Ai_site` объединяет несколько продуктов вокруг аккаунта и облака. Это не доказательство, что cloud auth, billing, browser automation или Code-OSS должны войти в local Core. Граница должна быть решена явно.

### Названия проектов и хронология

Название «Nexus старый проект» и номера версий дают ориентир, но не являются полноценной историей. Git commit dates, README versions и содержимое архивов могут расходиться. Самый старый/новый проект можно называть с высокой уверенностью только после отдельного git/tag audit.

## Решения, которые нельзя принять этим документом

Этот реестр не выбирает Bun или Node, конкретную SQLite schema, memory design, API transport, plugin protocol или security model. Эти вопросы вынесены в [NEXUS_DECISION_REGISTER.md](C:/Nexus_History/NEXUS_DECISION_REGISTER.md) для Principal Architect.
