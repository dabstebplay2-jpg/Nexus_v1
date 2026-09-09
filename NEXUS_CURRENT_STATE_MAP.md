# Nexus Current State Map

Дата: 9 сентября 2026 года  
Назначение: точная карта существующих компонентов для Principal Architect.  
Граница: описано текущее состояние архива по исходному коду, конфигурации, документации и выбранным проверкам. Будущая архитектура, миграция и план переписывания в этот документ не входят.

## Как читать карту

Статусы «готовность» означают готовность существующего компонента к своему текущему сценарию, а не готовность войти в Nexus Core. «Что можно переиспользовать» описывает наблюдаемые идеи/модули, но не является решением о переносе. «Что нельзя переносить» означает, что перенос целиком нарушит границы или сохранит неподтверждённые риски.

Есть важное именование: **MiniCursor — название продукта внутри каталога `cli`**. Ниже они описаны отдельно только для устранения неоднозначности: карточка MiniCursor объясняет продукт, карточка `cli` — фактическое дерево, запуск и границы репозитория. Это не две копии реализации.

---

## NexusCLI/nexus

**Название:** NexusCLI/nexus (самостоятельный Nexus CLI, не весь родительский OpenCode snapshot)

**Расположение:** `C:\Nexus_History\NexusCLI\nexus`

**Язык:** TypeScript

**Технологии:** Bun, SQLite, Zod, OpenAI-compatible Chat Completions, diff/patch tooling, Bun test runner.

**Точка входа:** `apps/cli/index.ts`, wrapper `nexus.cmd`; composition в `src/composition.ts`; API в `src/api.ts`.

**Назначение:** локальный coding/task agent, который выполняет ограниченные действия через tools и определяет завершение по проверяемому результату, а не только по тексту модели.

**Текущее состояние:** самостоятельный пакет версии `0.1.0`. `composition.ts` связывает Store, PermissionEngine, ToolExecutor, VerificationEngine, provider registry и AgentLoop. AgentLoop содержит ownership/recovery, steering/inbox, provider turns, tool execution, limits, action persistence и completion policy. Parent directory также содержит большой OpenCode tree; его нельзя автоматически считать частью этого компонента.

**Готовность:** наиболее зрелый execution path в архиве для локальных задач. Это рабочая основа в своём сценарии, но не готовый объединённый Nexus: нет доказанной интеграции с Axiom UI, live token event contract и production validation для всех внешних providers/processes.

**Тесты:** в выбранном локальном сценарии `bun test ./test` — 46 passed, 0 failed. Это подтверждает набор контрактов и unit/integration paths, но не реальное выполнение произвольных coding-задач, GUI, масштабирование или внешний provider.

**Что можно переиспользовать:** AgentLoop state transitions; typed tool registry/executor; permission and approval path; recovery/unknown state; action ledger/inbox; evidence and CompletionPolicy; SQLite transaction ideas; redaction and verification boundaries.

**Что нельзя переносить:** весь пакет вместе с Bun-specific runtime; неподтверждённые assumptions о session JSON scaling; provider implementation без согласования event/tool contracts; OpenCode packages из соседнего parent tree как будто это Nexus code.

**Зависимости:** Bun runtime; SQLite; OpenAI-compatible endpoint/credentials; Zod schemas; OS filesystem/process tools; repository-local scripts and test fixtures.

**Риски:** Bun/Node incompatibility; часть session хранится крупным JSON; live streaming в Web UI не оформлен единым протоколом; external model/tool behavior не покрыт полностью; родительский repository смешивает самостоятельный Nexus и reference code.

---

## Axiom

**Название:** Axiom local chat platform

**Расположение:** `C:\Nexus_History\Axiom`

**Язык:** TypeScript/TSX

**Технологии:** Node.js, npm workspaces, React, Vite, Express, SQLite, OpenAI-compatible Chat Completions, Mock Provider, `tsx`/Node test runner, Playwright, ESLint, TypeScript.

**Точка входа:** Web UI `apps/chat/src/main.tsx`; local server `apps/server/src/index.ts`; корневые scripts `dev`, `build`, `start`.

**Назначение:** локальный чат с отделённым ChatCore, provider registry, контекстом, persistence и loopback HTTP API.

**Текущее состояние:** alpha-проект (`0.1.0-alpha.2`) с packages `shared`, `core`, `providers`, `storage`, приложениями chat/server и документацией по architecture, providers, context, storage, security и verification. README явно ограничивает текущий scope: agents, tools, MCP и RAG не заявлены как реализованные функции.

**Готовность:** наиболее цельный chat/UI/storage lifecycle среди архивных проектов. Готов для локального chat-сценария с поддержанными providers; не является готовым Agent Core или публичной multi-user платформой.

**Тесты:** после создания корректных локальных workspace links в тестовой копии сборка packages и `tsx --test tests/*.test.ts` дали 32 passed, 0 failed. Browser E2E, внешние модели и публичный deployment не проверены. Архивные junctions указывали на внешние `C:\Axiom\...` пути.

**Что можно переиспользовать:** ChatCore lifecycle; cancellation and partial persistence; provider registry boundary; context policy; versioned migrations; message parts; recovery `generating -> aborted`; loopback API checks; React chat client and transport separation.

**Что нельзя переносить:** предположение, что ChatCore уже исполняет tools; provider credentials/cloud auth как часть local Core; архивные абсолютные workspace links; весь UI без проверки его API/event coupling.

**Зависимости:** Node.js; npm workspace/package links; Express; React/Vite; SQLite через `node:sqlite`; provider endpoints/keys; Playwright browser runtime для E2E.

**Риски:** конфликт `node:sqlite` с Bun storage; HTTP loopback host/origin checks не являются public authentication; provider adapters имеют иной tool-call behavior, чем NexusCLI; часть проверки зависела от исправленного окружения копии.

---

## Nexus Minecraft Launcher

**Название:** Nexus Minecraft Launcher; в архиве две копии одного desktop-направления

**Расположение:**

- canonical candidate: `C:\Nexus_History\Nexus_Minecraft\Nexus_Minecraft`
- historical baseline: `C:\Nexus_History\Nexus_Minecraft\Nexus_minecraft_launcher`

**Язык:** Python

**Технологии:** Python 3.12+, PySide6, `minecraft-launcher-lib`, `requests`/`urllib`, JSON persistence, `subprocess`, PyInstaller, Inno Setup; website/release metadata; `website-next` React/Vite scaffold.

**Точка входа:** `Nexus_Minecraft/Nexus_Minecraft/main.py` → `app/window.py:MainWindow`. Страницы UI вызывают core modules: Instances, Mods, Downloads, Accounts, Settings.

**Назначение:** Windows desktop launcher для Minecraft: instances, versions/loaders, Java discovery, accounts, downloads, modpacks/mods, process launch и updates.

**Текущее состояние:** новая копия имеет версию `1.1.4.2`, примерно 79 Python-файлов и более широкий pipeline; старая — `0.7.13`, примерно 67 файлов, меньший функциональный срез. Новая копия содержит loader version handling, расширенные settings/UI, Java checks, Microsoft/Ely auth paths и PID-aware updater. Текущий архив содержит незакоммиченные website/build изменения, поэтому version string не доказывает release stability.

**Готовность:** рабочий Windows MVP/предрелизный desktop product в своём Minecraft-сценарии. Stateful core слабее production launcher: нет полноценной persistent process supervision, безопасного token storage, обязательной update authenticity и достаточного isolated coverage.

**Тесты:** CI основной копии: Python 3.12, compile check, unittest discovery, `tools/deep_qa.py`; есть regression tests для modpack paths, HTTPS allowlist, SHA-512 и hash mismatch. DownloadManager, VersionManager, InstanceManager, Java discovery, Popen lifecycle, OAuth exchange и updater policy покрыты ограниченно. В текущем окружении PySide6, `minecraft_launcher_lib`, requests и keyring не установлены, live GUI/network не запускались.

**Что можно переиспользовать:** DownloadManager job/progress states и atomic write ideas; InstanceManager lifecycle/import/export/path checks; Java runtime discovery boundary; process supervision requirements; auth provider/token lifecycle abstractions; release metadata/checksum contract; Minecraft-specific tests как domain regression material.

**Что нельзя переносить:** PySide6 pages и worker callbacks в Core; monolithic `Launcher.launch_instance`; Minecraft loaders, Modrinth, `.minecraft` layout, JVM command and skins as generic abstractions; plaintext OAuth token JSON; updater path that accepts missing external checksum; Windows-only assumptions without adapter.

**Зависимости:** Python/PySide6; Minecraft launcher library and Mojang/loader services; Java installations; Modrinth/network endpoints; Windows process/filesystem behavior; OAuth providers; PyInstaller/Inno Setup for packaging.

**Риски:** two copies can diverge; JSON stores have no complete schema/migration/multi-process strategy; downloads ledger is not the downloader itself; launcher Popen handle/output/exit state is not durable; OAuth callback and token storage need hardening; updater has no mandatory signature/publisher trust; external services and live GUI are unverified here.

---

## Старый Nexus

**Название:** Nexus 5.0 beta / старый Python Nexus

**Расположение:** `C:\Nexus_History\Nexus старый проект`

**Язык:** Python

**Технологии:** Python ≥3.11, Typer, Rich, HTTPX, PyYAML, Pydantic, pytest; modules for runtime, kernel, agents, tools, memory, security, database, vector_store, workflow, plugins and web.

**Точка входа:** `pyproject.toml` registers `nexus = nexus.cli.main:app`; code also contains parallel `nexus/cli/cli/main.py` and several execution/sandbox paths.

**Назначение:** broad AI platform/CLI/REPL with planning, orchestration, models, tools, memory, security and web surfaces.

**Текущее состояние:** manifest `5.0.0-beta`; wide and internally duplicated history. Deep inspection showed that current runtime does assemble AgentExecutor, OrchestraRuntime, models, tools and memory, so old claims that the CLI is entirely disconnected are stale. Some legacy docs still describe older states.

**Готовность:** partial working platform and valuable historical material, but not a reliable Nexus Core candidate. Selected tests pass for portions of runtime, yet execution security and completion semantics are insufficiently trustworthy for the primary foundation.

**Тесты:** selected audit run reported 29 passed. It does not prove whole-platform readiness. Security check is recorded but does not consistently gate execution; runtime can set `COMPLETED` after orchestration without independent evidence. Memory/API/vector/web completeness is not established by module names.

**Что можно переиспользовать:** role-oriented planning; dependency graph/orchestration scenarios; activity event vocabulary; CLI diagnostics/UX; regression scenarios; domain terminology where verified by tests.

**Что нельзя переносить:** legacy regex conversion of model text into file/shell actions; current non-blocking security gate; completion based only on orchestration return; in-process `Database`/`VectorMemory` as proof of durable DB/RAG; decorative or unused subsystem stubs.

**Зависимости:** Python packages above; YAML/model configuration; HTTP providers; local filesystem/processes; optional database/vector/web modules.

**Риски:** duplicate entry points and execution paths; stale technical-debt documentation; unclear imports/users of compatibility aliases; security and verification bypasses; broad scope makes ownership and test coverage unclear.

---

## MiniCursor

**Название:** MiniCursor (product identity for the `cli` tree)

**Расположение:** `C:\Nexus_History\cli`

**Язык:** Python

**Технологии:** Python, `llama-cpp-python`/GGUF/CUDA for local inference; PyTorch, Unsloth, Transformers, PEFT, TRL and bitsandbytes for training; pytest; Windows batch/scripts.

**Точка входа:** `minicursor.py`; Windows launcher `start.bat`; CUDA preparation `scripts/prepare_windows_cuda.py`.

**Назначение:** local model chat/runtime for GGUF on Windows/NVIDIA, plus a separate QLoRA training pipeline.

**Текущее состояние:** repository contains `core/runtime.py`, `backends/llama_cpp.py`, `models/manager.py`, `config/settings.py`, `training/{manager,worker,dataset}.py`, and additional `agent`, `memory`, `tools` directories. The current product path is primarily local inference/configuration; agent/memory/tools integration is weaker and partly experimental.

**Готовность:** usable as a hardware-specific local inference experiment when its CUDA environment is available. Not a general Agent Core, not a portable provider service and not evidence that local training belongs in Nexus v1.0.

**Тесты:** selected settings/runtime/models/backend tests: 24 passed, 4 failed. Failures concern mismatch between expected thinking defaults/commands and current implementation. Real CUDA generation, GPU memory behavior and QLoRA training were not validated.

**Что можно переиспользовать:** local model discovery; configuration validation/atomic save ideas; llama.cpp backend boundary; hardware diagnostics; clear separation between inference and training dependencies.

**Что нельзя переносить:** fixed-plan/keyword agent router as a task engine; simple JSON memory as a general memory architecture; shell/filesystem helpers without NexusCLI permission contract; CUDA/training stack into the base runtime.

**Зависимости:** Windows/NVIDIA/CUDA; llama.cpp native bindings; large model files; Python ML stack; optional training packages; local configuration and filesystem.

**Риски:** hardware-specific reproducibility; large native dependencies; unresolved thinking behavior; agent/memory/tools may not be connected to main CLI; model weights/datasets are not evaluated here.

---

## cli (repository and entrypoint view)

**Название:** `cli` — фактический repository/catalog name of MiniCursor

**Расположение:** `C:\Nexus_History\cli`

**Язык:** Python

**Технологии:** те же, что у MiniCursor: Python, llama.cpp/GGUF/CUDA, PyTorch/QLoRA training stack, pytest и Windows scripts.

**Точка входа:** `cli/minicursor.py`, `cli/start.bat`.

**Назначение:** фактическая упаковка исходников MiniCursor: runtime, backend, model manager, config, training, tests и экспериментальные agent/memory/tools directories.

**Текущее состояние:** отдельного второго проекта `cli` в архиве не обнаружено. Карточка нужна только потому, что в запросах и старых отчётах используются оба имени: «MiniCursor» как продукт и «cli» как папка.

**Готовность:** определяется карточкой MiniCursor; самостоятельный второй статус не присваивается.

**Тесты:** те же 24 passed / 4 failed в выбранном наборе; см. карточку MiniCursor.

**Что можно переиспользовать:** только после подтверждения владельца и границ — model backend/configuration/hardware pieces, перечисленные выше.

**Что нельзя переносить:** нельзя создавать вторую canonical implementation только из-за различия названия; training, experimental agent and simple memory paths не считать готовым Core.

**Зависимости:** те же Python/CUDA/ML dependencies MiniCursor.

**Риски:** двойной учёт в ecosystem map; разные отчёты могут ошибочно посчитать MiniCursor и `cli` двумя проектами.

---

## Nexus Maker

**Название:** Nexus Maker

**Расположение:** `C:\Nexus_History\Nexus_Maker`

**Язык:** TypeScript/TSX

**Технологии:** React 19, Vite, Zustand, Vitest, browser `localStorage`, portable `.nexus` document format.

**Точка входа:** `index.html` → `src/main.tsx`; Windows launcher `start.bat`.

**Назначение:** visual editor for canvas/layers/drawing/prototyping/animation and code export.

**Текущее состояние:** version `0.2.0`; document format v3 and v1/v2 migration documentation; modules for editor API, project IO, viewport coordinates, scene graph and layout engine.

**Готовность:** functional editor prototype with meaningful geometry/layout/document tests. Not an AI agent runtime or shared Core service.

**Тесты:** tests cover coordinates, scene, layout and store; selected run found a grouping/reparenting defect: `groupSelected()` creates a group while scene graph only accepts a frame parent, leaving child `parentId` unset.

**Что можно переиспользовать:** document model; import/export contract; editor API boundary; coordinate and layout test techniques; undo/redo concepts if needed by a client.

**Что нельзя переносить:** entire canvas UI/store into Core; browser localStorage as universal persistence; editor-specific geometry as generic task state.

**Зависимости:** Node/npm workspace; React/Vite; Zustand; browser runtime; localStorage; Vitest.

**Риски:** known grouping defect; browser-only assumptions; document migrations are editor-specific; large client surface is tightly coupled to UI state.

---

## Nexus AI Site

**Название:** Nexus AI Site ecosystem (frontend, cloud server, local backend, desktop IDE and browser)

**Расположение:** `C:\Nexus_History\Nexus_Ai_site`

**Языки:** JavaScript/JSX, Python, PowerShell; Electron/Chromium process code.

**Технологии:** React/Vite, Monaco, Tailwind, FastAPI, SQLAlchemy, JWT, HTTPX, PostgreSQL/Upstash Redis dependencies, WebSockets, Code-OSS/VSCodium, OpenVSX, Electron/Chromium, Playwright/Node tests.

**Точки входа:**

- frontend: `frontend/src/main.jsx`;
- cloud API: `nexus-cloud-server/app/main.py`;
- admin UI: `nexus-cloud-server/admin_ui/src/main.jsx`;
- local IDE proxy: `backend/app/main.py`;
- desktop build: `nexus-desktop/scripts/prepare.ps1` / `scripts/build.ps1` and extension manifests;
- browser: `nexus-browser/main/index.js`, `preload/index.js`, `renderer/main.jsx`.

**Назначение:** separate cloud/client ecosystem with website chat, accounts, model access, billing, connectors, Web IDE, Code-OSS extensions and AI browser.

**Текущее состояние:** multiple independently versioned applications: frontend `0.1.49`, browser `0.4.1`, `nexus-ai` extension `1.8.0` by manifests. Contains server tests, frontend Playwright and extension Node tests; deployment addresses and README claims were not live-verified. Cloud and local services have separate boundaries.

**Готовность:** a collection of prototypes/early products with real application surfaces and tests, not a single verified Nexus Core. Individual cloud/client paths may run in their intended environments; public availability and deployment correctness were not established in this audit.

**Тесты:** server pytest, frontend Playwright and extension Node tests are present; no full ecosystem execution or live billing/OAuth/connector/deployment audit was performed.

**Что можно переиспользовать:** selected chat UX; model picker and provider catalog concepts; streaming/source/thinking components; connector scenarios; cloud memory/profile data model as a separate service reference; IDE/browser integration requirements.

**Что нельзя переносить:** cloud accounts, billing, tenant auth, connector credentials, Code-OSS/Electron packaging and browser automation into local Core by default; frontend hooks with cloud coupling; deployment URLs as proof of availability.

**Зависимости:** Node/Vite/React browser stack; Python/FastAPI/SQLAlchemy; database/cache services; JWT/OAuth providers; Code-OSS/OpenVSX; Electron/Chromium; external model and connector APIs.

**Риски:** large multi-product surface; local/cloud trust boundaries unclear; credentials and billing require separate threat model; deployment configuration may differ by environment; IDE/browser dependencies greatly increase release and support burden.

---

## Cross-component observations (current state only)

1. Two strongest but different foundations exist: NexusCLI/nexus for task execution and Axiom for chat/UI/storage lifecycle.
2. Minecraft contains useful concrete runtime/process/download/auth cases, but its current implementations are Windows/Minecraft-specific and have state/security gaps.
3. Old Nexus has the broadest vocabulary and historical experimentation, but its duplicate paths and verification/security weaknesses make its “platform” label broader than its proven guarantees.
4. MiniCursor/`cli` is one local inference/training project, not two separate components.
5. Nexus Maker and Nexus AI Site are clients/products with their own persistence and deployment assumptions, not current Core implementations.
6. No component in the archive proves a complete, integrated Nexus v1.0. This is a statement about current evidence, not a future design decision.

## Evidence boundary

The map reflects the existing audit documents and their selected source/test checks. GUI, live network OAuth, external model behavior, multi-process locking, updater authenticity, CUDA generation and public deployment were not uniformly executed in the current environment. Those limitations are part of the current state and must not be silently converted into positive readiness claims.
