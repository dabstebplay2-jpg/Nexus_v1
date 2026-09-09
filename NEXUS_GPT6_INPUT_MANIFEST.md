# Nexus GPT-6 Input Manifest

Дата: 9 сентября 2026 года  
Назначение: дать GPT-6 короткий управляемый маршрут по материалам Nexus. Не начинать с полного обхода `C:\Nexus_History` и не читать зависимости, build caches или ZIP snapshots без адресной причины.

## Правило использования

Сначала прочитай документы в порядке ниже. После этого проверяй исходный код только адресно для P0 decisions, security claims, feasibility blockers и противоречивых findings. Если документ говорит `consult when needed`, не трать usage budget на полный повторный аудит до появления конкретного вопроса.

`NEXUS_GPT6_MASTER_PROMPT_V2.md` является инструкцией к работе. Остальные файлы — evidence и ограничения, а не готовые архитектурные решения.

## Рекомендуемый порядок чтения

### 0. NEXUS_GPT6_MASTER_PROMPT_V2.md

**Purpose:** основной standalone prompt: mission, hard constraints, evidence rules, P0/P1/P2, workflow, terminology, anti-overengineering и stop condition.  
**Priority:** P0  
**Read fully / consult when needed:** **Read fully before any analysis.**

### 1. NEXUS_GPT6_BRIEFING.md

**Purpose:** краткий контекст Nexus, карта проектов, доказанные факты, confidence matrix, критический review и known non-goals.  
**Priority:** P0  
**Read fully / consult when needed:** **Read fully.** Это первая evidence-карта после prompt.

### 2. NEXUS_ARCHITECTURAL_CONFLICTS.md

**Purpose:** конфликты Agent/Core vs Chat, Bun vs Node, SQLite, Memory, Tools, Providers, Events, APIs, Runtime/Process и Security; причины, по которым простой merge ломается.  
**Priority:** P0  
**Read fully / consult when needed:** **Read fully.** Используй как список проверок и не принимай его possible solutions за decisions.

### 3. NEXUS_DECISION_REGISTER.md

**Purpose:** нерешённые ADR-вопросы по runtime, repository, Core, Agent/Chat, tools, events, storage, memory, context, secrets, plugins, processes, security, migration, providers, testing, cloud boundary, versioning и observability.  
**Priority:** P0  
**Read fully / consult when needed:** **Read fully.** Это список вопросов, которые должен закрыть GPT-6.

### 4. NEXUS_MVP_BOUNDARY.md

**Purpose:** граница для одного разработчика: MUST HAVE, SHOULD HAVE, NOT NOW и observable readiness criteria.  
**Priority:** P0  
**Read fully / consult when needed:** **Read fully.** Не расширяй scope, если не зарегистрировал конфликт и причину.

### 5. NEXUS_CURRENT_STATE_MAP.md

**Purpose:** текущие расположение, язык, технологии, entry points, состояние, тесты, reuse candidates, non-transferable parts, dependencies и risks для каждого проекта.  
**Priority:** P0  
**Read fully / consult when needed:** **Read fully.** Используй как быстрый индекс для адресной проверки исходников.

### 6. NEXUS_RED_TEAM_REVIEW.md

**Purpose:** попытка доказать провал: false success, duplicate side effects, process/storage/recovery failures, memory leakage, provider mismatch, security debt и one-developer operability risks.  
**Priority:** P0  
**Read fully / consult when needed:** **Read fully.** После architecture вернись к нему для собственного red-team pass.

### 7. NEXUS_MIGRATION_FEASIBILITY.md

**Purpose:** migration value/difficulty/action для NexusCLI, Axiom, Minecraft Launcher, Old Nexus, MiniCursor и Maker.  
**Priority:** P1  
**Read fully / consult when needed:** **Read fully before migration decisions; otherwise consult by project.** Это feasibility assessment, не утверждённый migration plan.

### 8. NEXUS_AUDIT.md

**Purpose:** первичная ecosystem map, project tree, entry points, technologies, documentation coverage, initial limitations и Minecraft addendum.  
**Priority:** P1  
**Read fully / consult when needed:** **Consult when needed; read relevant sections first.** Не используй предварительные claims без сверки с более глубокими анализами.

### 9. NEXUS_COMPONENT_ANALYSIS.md

**Purpose:** глубокий сравнительный анализ Agent Core, ChatCore, providers, memory, tools, storage, CLI, UI, testing и Minecraft component addendum.  
**Priority:** P0 for component decisions; P1 otherwise  
**Read fully / consult when needed:** **Consult by P0 topic; read fully only if a decision depends on several component areas.** Это один из основных источников evidence, но не готовая architecture.

### 10. NEXUS_MINECRAFT_ANALYSIS.md

**Purpose:** detailed architecture and module review of both Minecraft launcher copies: DownloadManager, VersionManager, InstanceManager, Java Manager, Launcher, Auth, Updater, CI and test gaps.  
**Priority:** P1; P0 only if Minecraft/runtime/process boundary is proposed for v1.0  
**Read fully / consult when needed:** **Consult targeted sections.** Не включай Minecraft domain в MVP автоматически.

### 11. NEXUS_FUTURE_IDEAS.md

**Purpose:** parking lot for Studio, Game Dev Edition, Marketplace, Multi-Agent, IDE, Browser, Plugins, Cloud and Teams.  
**Priority:** P2  
**Read fully / consult when needed:** **Consult when checking scope/non-goals.** Не используй как requirements backlog.

## Addressed source verification

После чтения документов не сканируй весь архив. Сначала составь список P0 unknowns, затем проверь только связанные исходные пути:

1. `NexusCLI/nexus` — AgentLoop, composition, storage, tools, verification/completion и provider boundary.
2. `Axiom` — ChatCore, storage migrations, server API, provider registry и client event path.
3. `Nexus_Minecraft` — только если затронуты process/runtime/download/auth/update contracts.
4. `Nexus старый проект` — только для проверки конкретного claim о runtime/security/completion.
5. `cli` — только если local model provider входит в supported scope.
6. `Nexus_Maker` — только если document/editor client входит в scope.

Не считай `node_modules`, `dist`, caches, model weights, datasets, secrets и ZIP snapshots отдельными product implementations без отдельного доказательства.

## Missing input notice

На момент подготовки manifest файл `NEXUS_GPT6_MASTER_PROMPT.md` в `C:\Nexus_History` отсутствовал, включая рекурсивный поиск Markdown-файлов. Поэтому этот manifest ссылается на доступную самостоятельную V2. Если V1 будет добавлена позже, её нужно сравнить с V2 и проверить сохранение всех специфических требований до отправки GPT-6.
