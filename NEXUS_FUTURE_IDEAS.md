# Nexus Future Ideas

Дата: 9 сентября 2026 года  
Статус: parking lot. Эти идеи сохраняются, но не являются частью Nexus v1.0 и не должны расширять его scope без отдельного решения.

## Nexus Studio

**Идея:** единая визуальная среда для работы с chat, tasks, files, agents, models и проектами.

**Потенциальная ценность:** снижает барьер входа и может объединить CLI/Core capabilities в понятный рабочий стол.

**Почему НЕ входит в v1.0:** потребует отдельной information architecture, state synchronization, permissions UI и поддержки множества режимов до доказательства базового engine.

**Когда можно рассматривать:** после стабильного Core API/event protocol и нескольких подтверждённых task workflows.

## Game Dev Edition

**Идея:** специализированная редакция Nexus для игровых проектов, включая Minecraft tooling, asset workflows и runtime management.

**Потенциальная ценность:** использует уже найденные launcher/instance/runtime модули и создаёт вертикальный продукт.

**Почему НЕ входит в v1.0:** Minecraft — отдельный domain с Java, loaders, accounts, modpacks, updater и Windows UI; он не должен определять универсальные Core boundaries.

**Когда можно рассматривать:** после стабилизации Minecraft launcher как отдельного клиента и формального adapter contract с Core.

## Marketplace

**Идея:** каталог моделей, tools, plugins, agents, templates и интеграций.

**Потенциальная ценность:** расширяет возможности без включения каждого provider/tool в основной дистрибутив.

**Почему НЕ входит в v1.0:** нужны signing, trust, billing, version compatibility, malware review, permissions и support process.

**Когда можно рассматривать:** после plugin protocol, capability model, signed artifacts и threat model.

## Multi-Agent

**Идея:** несколько специализированных агентов для planning, coding, research, review или background tasks.

**Потенциальная ценность:** декомпозирует сложные задачи и позволяет назначать модели по capability/cost.

**Почему НЕ входит в v1.0:** увеличивает context routing, coordination, cancellation, cost, observability и failure recovery; базовый AgentLoop ещё должен доказать один надёжный task.

**Когда можно рассматривать:** после измеренного single-agent baseline, durable task graph и явного budget/permission policy.

## IDE

**Идея:** полноценная среда разработки на базе Code-OSS/VSCodium или отдельный Nexus editor.

**Потенциальная ценность:** делает coding agent частью рабочего процесса с workspace, terminal и diagnostics.

**Почему НЕ входит в v1.0:** IDE — большой самостоятельный продукт с packaging, extensions, filesystem trust, language servers и release cadence.

**Когда можно рассматривать:** когда CLI/API/Core доказали стабильные session, tool, process и file contracts.

## Browser

**Идея:** AI-браузер для web navigation, research, automation и account-aware actions.

**Потенциальная ценность:** добавляет web context и автоматизацию к Nexus tasks.

**Почему НЕ входит в v1.0:** browser automation — отдельная security boundary с cookies, downloads, identity, prompt injection и high-risk actions.

**Когда можно рассматривать:** после отдельного browser threat model, approval UX и sandboxed connector protocol.

## Plugins

**Идея:** расширения Core через локальные или внешние plugins.

**Потенциальная ценность:** позволяет добавлять providers, tools, domain adapters и UI без изменения ядра.

**Почему НЕ входит в v1.0:** без versioned manifest, capabilities, signing, isolation и failure handling plugin system станет каналом произвольного кода.

**Когда можно рассматривать:** после ADR по plugin boundary и security, а также стабильных tool/event contracts.

## Cloud

**Идея:** hosted Nexus с аккаунтами, sync, remote execution, models, connectors and billing.

**Потенциальная ценность:** доступ с разных устройств, team data, centralized model access и operations.

**Почему НЕ входит в v1.0:** меняет privacy, tenancy, auth, cost, deployment и data ownership; cloud проект уже имеет отдельные boundaries.

**Когда можно рассматривать:** после определения local/cloud split и доказанного local product, с отдельным threat model и service SLO.

## Teams

**Идея:** совместные проекты, shared tasks, permissions, reviews и organization workspaces.

**Потенциальная ценность:** превращает личный assistant в командный workflow.

**Почему НЕ входит в v1.0:** нужны multi-tenant storage, roles, audit, conflict resolution, billing и compliance.

**Когда можно рассматривать:** после cloud foundation, stable audit/evidence model и доказанной одиночной модели данных.

## Правило parking lot

Ни одна идея из этого списка не должна добавляться в v1.0 только потому, что для неё уже существует прототип. Для включения нужны отдельный scope decision, owner, threat model, acceptance criteria и объяснение, какую доказанную проблему текущего пользователя она решает.
