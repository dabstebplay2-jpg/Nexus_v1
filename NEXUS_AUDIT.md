# Nexus Ecosystem Map — первичный аудит структуры

Дата: 9 сентября 2026 года. Статус: **первый этап завершён; глубокий аудит не проводился**.

## Границы обследования

Доступный архив находится в `C:\Nexus_History`. Отдельная папка `Nexus_ALL` в его корне не обнаружена; обследованы все девять имеющихся папок проектов. Если Nexus_ALL обозначает другой архив, полноту относительно него этот отчёт не подтверждает.

Просмотрены основные каталоги, README, манифесты зависимостей и запуска, имена документации и тестов; выборочно проверены точки входа и импорты. Это карта для дальнейшего анализа, а не заключение о качестве или готовности продукта. Описание возможностей из README обозначает заявленное состояние, пока оно не подтверждено выполнением и анализом кода.

Приложения, тесты, сборки, установка зависимостей и обучение не запускались. Существующий код не изменялся; файлы не удалялись. Содержимое секретов, пользовательских баз, весов моделей и датасетов не исследовалось. Каталоги зависимостей, виртуальных окружений, сборок и кэшей исключались из обзора исходников. ZIP-архивы обнаружены, но их содержимое не раскрывалось. Git-история пока не анализировалась.

## Дерево проектов

```text
C:\Nexus_History\
├── Axiom/                         Локальная платформа Chat + независимый Core
│   ├── apps/chat/                 React-интерфейс
│   ├── apps/server/               Локальный HTTP API
│   ├── packages/{shared,core,providers,storage}/
│   ├── tests/                     Unit/integration/E2E
│   └── docs/                      Архитектура, контекст, хранение, проверки
├── cli/                           MiniCursor: локальные GGUF и QLoRA
│   ├── minicursor.py              Терминальная точка входа
│   ├── {agent,backends,core,config,models,memory,tools}/
│   └── {training,scripts,tests}/
├── Create_my_AI_NEXUSAI/           Эксперименты с собственной языковой моделью
│   ├── {model,tokenizer,trainer}/
│   ├── {data,datasets,models,experiments}/
│   ├── archive/{generators_old,models_old,old_scripts,train_old}/
│   └── {scripts/dataset_tools,tests}/
├── Nexus старый проект/           Python-платформа Nexus 5.0 beta
│   ├── nexus/                     CLI, агенты, runtime, модели, память, tools
│   ├── docs/                      Предыдущие аудиты и планы миграции
│   ├── tests/
│   └── NexusCLI.zip               Неисследованный вложенный снимок
├── Nexus_Ai_site/                  Экосистема сайта, облака, IDE и браузера
│   ├── frontend/                  React-сайт и интерфейс чата/IDE
│   ├── nexus-cloud-server/        FastAPI: аккаунты, AI, billing, администрирование
│   │   ├── app/                   Сервер приложения
│   │   ├── admin_ui/              Отдельный интерфейс администратора
│   │   └── {tests,docs}/
│   ├── backend/                   Локальный прокси IDE
│   ├── nexus-desktop/             Сборка Code-OSS/VSCodium
│   │   └── extensions/            nexus-ai, nexus-auth, nexus-billing, nexus-welcome
│   ├── nexus-browser/             Electron-приложение
│   └── {docs,deploy,scripts,.github}/
├── Nexus_Maker/                    Визуальный редактор интерфейсов
│   ├── src/{components,editor,lib,store,types}/
│   ├── public/
│   └── Nexus_Maker_0.1.zip         Неисследованный предыдущий снимок
├── NexusCLI/                       Родительский репозиторий OpenCode + отдельный Nexus
│   ├── nexus/                     Собственный NexusCLI 0.1
│   │   ├── apps/cli/
│   │   ├── src/                   Core, tools, storage, recovery, verification
│   │   └── {docs,test,bench,script}/
│   ├── packages/                  Пакеты OpenCode, не пакеты собственного Nexus
│   │   ├── {opencode,cli,tui,app,desktop,ui,session-ui}/
│   │   ├── {schema,core,protocol,server,client,llm}/
│   │   └── SDK, plugins, console, web, stats и вспомогательные пакеты
│   └── {sdks,infra,specs,script,perf,artifacts,nix}/
├── NexusTest/                      Минимальный пример функции и теста
└── no-code/                        AI-чат для планирования сайтов и no-code задач
    ├── src/
    ├── server/                    Общий AI-сервис
    └── api/                       Serverless-обработчики
```

Дерево намеренно сокращено: показаны продуктовые границы и основные каталоги, а не каждый файл. Служебные `.axiom`, `.nexus`, окружения, `node_modules`, `dist`, кэши и подобные папки не являются отдельными проектами.

## Карточки проектов

### 1. Axiom

- **Назначение:** локальный AI-чат с отделённым от интерфейса ядром, рассчитанным на дальнейшие Chat, Code и CLI.
- **Технологии:** TypeScript/TSX, Node.js, npm workspaces, React, Vite, Express, SQLite; OpenAI-compatible Chat Completions и Mock Provider. Проверки: Node test runner через tsx, Playwright, ESLint, TypeScript.
- **Точки входа:** `Axiom/apps/chat/src/main.tsx`, `Axiom/apps/server/src/index.ts`; корневые scripts `dev`, `build`, `start`.
- **Конфигурация:** корневой и пакетные `package.json`, `tsconfig*.json`, `playwright.config.ts`, `eslint.config.js`, `.nvmrc`.
- **Документация:** `Axiom/README.md`, `Axiom/docs/{ARCHITECTURE,PROVIDERS,CONTEXT,STORAGE,SECURITY,VERIFICATION,ROADMAP}.md`.
- **Состояние:** манифест `0.1.0-alpha.2`; README описывает локальный чат, потоковую генерацию, вложения и хранение. Прямо отмечено отсутствие агентов, выполнения tools, MCP, памяти и RAG. Наличие Core не означает наличие Agent Core.
- **Интересно изучить дальше:** границы core/providers/storage, жизненный цикл генерации, отмену, восстановление SQLite, реестр моделей и тесты HTTP-контракта. Это кандидаты, а не уже признанные лучшие реализации.

### 2. cli — MiniCursor

- **Назначение:** локальный чат с GGUF на Windows/NVIDIA и отдельный процесс QLoRA-обучения.
- **Технологии:** Python, llama-cpp-python/CUDA; отдельные зависимости PyTorch, Unsloth, Transformers, PEFT, TRL, bitsandbytes для обучения; pytest.
- **Точки входа:** `cli/minicursor.py`, `cli/start.bat`; подготовка окружения — `cli/scripts/prepare_windows_cuda.py`.
- **Главные модули:** `core/runtime.py`, `backends/llama_cpp.py`, `models/manager.py`, `config/settings.py`, `training/{manager,worker,dataset}.py`. Есть `agent/`, `memory/` и `tools/`; степень их подключения к текущему CLI ещё не установлена.
- **Конфигурация и документы:** `cli/README.md`, `requirements.txt`, `requirements-train.txt`, `config/settings.json`.
- **Состояние:** README описывает загрузку/выгрузку моделей, чат и сохраняемые настройки; присутствуют тесты и артефакты hardware-smoke. Их наличие не доказывает воспроизводимость на другом компьютере.
- **Интересно изучить дальше:** управление локальными моделями, проверку и атомарное сохранение настроек, разделение inference и training. Не смешивать этот проект с `NexusCLI/nexus`.

### 3. Create_my_AI_NEXUSAI

- **Назначение:** исследовательская ветка собственной языковой модели: от символьных и словных моделей к Transformer/GPT и BPE.
- **Технологии:** Python, PyTorch, CUDA, собственные токенизаторы; JSON/JSONL для данных и метаданных, PTH для весов.
- **Точки входа:** `nexusai.py`, `generate_text.py`, `generate_gpt.py`, `train_v018.py`; обработка данных — `scripts/dataset_tools/` и корневые dataset-скрипты.
- **Главные файлы:** `nexus_config.py`, `model/{char_model,word_context8_model,transformer_model,gpt_model_v016,nexus_gpt017}.py`, `tokenizer/nexus_bpe_tokenizer.py`, `trainer/{trainer,checkpoint}.py`.
- **Документация:** корневой README, `archive/models_old/NexusAI_v0.010/README.md`, `models/NexusAI_v0.018/notes.txt`. В корне не обнаружен стандартный манифест зависимостей `requirements.txt` или `pyproject.toml`.
- **Состояние:** архив экспериментов с тестами, датасетами и весами. README описывает v0.001–v0.010 и планирует v0.015, тогда как дерево уже содержит v0.018. `train_v018.py` импортирует `NexusGPT016` из `gpt_model_v016.py`; соответствие названий и реальной архитектуры требует отдельной проверки.
- **Интересно изучить дальше:** эволюцию токенизации, dataset pipeline, сохранение checkpoint и загрузку разных версий. Качество модели без экспериментов не оценено.

### 4. Nexus старый проект

- **Назначение:** Python AI-платформа с CLI/REPL; README называет её «Nexus 5.0 — Ultimate AI OS».
- **Технологии:** Python ≥3.11, Typer, Rich, HTTPX, PyYAML, Pydantic, pytest. Есть модули database, vector_store, workflow, plugins и web, но названия не подтверждают полноту реализации.
- **Точка входа:** `pyproject.toml` регистрирует `nexus = nexus.cli.main:app`, то есть `nexus/cli/main.py`.
- **Конфигурация:** `pyproject.toml`, `nexus.yaml`, `models.yaml`, `Dockerfile`.
- **Документация:** README, README_NEXUS_5_BETA, CHANGELOG и UPGRADE-файлы; `docs/{ARCHITECTURE_ANALYSIS,CURRENT_STATE,MIGRATION_PLAN,TECHNICAL_DEBT,PHASE_1_REPORT,PHASE_2_MODEL_SYSTEM}.md`, документы Nexus 3 и 5. Их выводы ещё не сверены с текущим кодом.
- **Состояние:** манифест `5.0.0-beta`; широкая структура с runtime, kernel, tools, memory, security, agents и другими подсистемами. Обнаружены параллельные пути `nexus/cli/main.py` и `nexus/cli/cli/main.py`, несколько модулей execution и sandbox. Это точки для анализа дублирования, а не доказательство ошибочности каждого дубля.
- **Интересно изучить дальше:** историю Agent Core, интеграцию models/tools/memory и существующие планы миграции. Название папки «старый» не устанавливает её место в общей хронологии.

### 5. Nexus_Ai_site

Это несколько связанных приложений с отдельными точками входа, а не только сайт.

| Подпроект | Назначение и технологии | Точки входа / главные файлы |
|---|---|---|
| `frontend` | Сайт, чат, тарифы, настройки и элементы web IDE; JavaScript/JSX, React, Vite, Monaco, Tailwind | `frontend/src/main.jsx`, `frontend/package.json` |
| `nexus-cloud-server` | Облачный API: auth, AI, billing, администрирование; Python/FastAPI, SQLAlchemy, JWT, HTTPX, зависимости PostgreSQL и Upstash Redis | `nexus-cloud-server/app/main.py`; `main.py` — совместимый реэкспорт |
| `nexus-cloud-server/admin_ui` | Отдельный административный UI; JSX | `admin_ui/src/main.jsx`, `admin_ui/package.json` |
| `backend` | Локальный прокси IDE; Python/FastAPI, WebSockets, HTTPX | `backend/app/main.py`; `backend/main.py` — совместимый реэкспорт |
| `nexus-desktop` | IDE на Code-OSS/VSCodium с OpenVSX и расширениями Nexus; JavaScript, PowerShell | `scripts/prepare.ps1`, `scripts/build.ps1`, `product/product.json`, манифесты расширений; `extensions/nexus-ai/extension.js` |
| `nexus-browser` | Отдельный AI-браузер; Electron/Chromium, React/Vite | `main/index.js`, `preload/index.js`, `renderer/main.jsx`, `package.json` |

- **Конфигурация:** отдельные `package.json`, серверные `requirements*.txt`, корневые `pyproject.toml`, `docker-compose.yml`, `render.yaml`, `vercel.json`; scripts запуска `nexus.bat` и `scripts/nexus.ps1`; deployment и CI-каталоги.
- **Документация:** корневые README и PROJECT, README подпроектов; `docs/NEXUS_BROWSER_ARCH.md`, `WEB_IDE_LITE.md`, `NEXUS_DESKTOP_BUILD.md`, `SOLO_HOSTING_RU.md`, `AUDIT_2026-07-14_RU.md`, серверные deployment-документы и smoke-checklist IDE.
- **Состояние:** frontend `0.1.49`, браузер `0.4.1`, расширение nexus-ai `1.8.0` по манифестам. Есть серверные pytest-тесты, frontend Playwright и Node-тесты расширения. README содержит адреса развёртывания; доступность этих сервисов не проверялась.
- **Интересно изучить дальше:** облачный реестр моделей, потоковую генерацию, память пользователя, инструменты коннекторов, общий аккаунт сайта/IDE/браузера. Зависимость драйвера БД не доказывает, какая БД используется в конкретном окружении.

### 6. Nexus_Maker

- **Назначение:** локальный визуальный редактор с холстом, слоями, рисованием, прототипированием, анимацией и выдачей кода.
- **Технологии:** TypeScript/TSX, React 19, Vite, Zustand, Vitest; browser localStorage и переносимый JSON-формат `.nexus`.
- **Точки входа:** `index.html`, `src/main.tsx`; `start.bat` для запуска.
- **Главные файлы:** `src/store/editorStore.ts`, `src/editor/api/editorApi.ts`, `src/editor/document/projectIO.ts`, `src/editor/viewport/coordinates.ts`, `src/editor/scene/sceneGraph.ts`, `src/editor/layout/layoutEngine.ts`.
- **Конфигурация и документы:** `package.json`, `vite.config.ts`, `tsconfig*.json`; README, IMPLEMENTED, HOTKEYS и CHANGELOG.
- **Состояние:** манифест `0.2.0`; README описывает формат документа v3 и миграции v1/v2. Обнаружены тесты координат, сцены, layout и store. ZIP `Nexus_Maker_0.1.zip` оставлен для отдельного сравнения.
- **Интересно изучить дальше:** Editor API, документную модель, Undo/Redo, систему координат и импорт/экспорт. Это редактор, а не уже подключённое ядро AI-агента.

### 7. NexusCLI: две разные границы

**Родительский OpenCode.** Корневой README, имя `opencode` и repository в `package.json` прямо указывают на OpenCode. Стек: TypeScript, Bun workspaces, Turbo, Effect, SolidJS/OpenTUI, Vite, Drizzle/SQLite; desktop и SDK-пакеты. Корневой `dev` указывает на `packages/opencode/src/index.ts`. Основные конфигурации: `package.json`, `bun.lock`, `bunfig.toml`, `turbo.json`, `tsconfig.json`, `sst.config.ts`, `flake.nix`. Документация: многоязычные README, CONTEXT, CONTRIBUTING, SECURITY, AGENTS и пакетные документы. Все локальные отличия от upstream пока не установлены; нельзя считать весь этот объём авторским Nexus.

**Собственный `NexusCLI/nexus`.**

- **Назначение:** локальный coding agent, у которого завершение задачи определяется ядром по результатам проверок.
- **Технологии:** TypeScript, Bun, SQLite, Zod, diff, OpenAI-compatible Chat Completions. Собственный манифест `@nexuscli/agent` версии `0.1.0`.
- **Точки входа:** `nexus/apps/cli/index.ts`, `nexus/nexus.cmd`; композиция — `nexus/src/composition.ts`, API — `nexus/src/api.ts` (пути относительно родительского `NexusCLI`).
- **Главные компоненты:** `src/core/agent-loop.ts`, `src/session/inbox.ts`, `src/storage/{sqlite,migrations}.ts`, `src/context/manager.ts`, `src/llm/openai-compatible.ts`, `src/tools/`, `src/verification/engine.ts`, `src/completion/policy.ts`, `src/recovery/policy.ts`.
- **Конфигурация и документы:** собственные `package.json`, `bunfig.toml`; README, THIRD_PARTY_NOTICES и `docs/{ARCHITECTURE,AGENT_LOOP,API,TOOLS,RECOVERY,VERIFICATION,ROADMAP}.md`.
- **Состояние:** README описывает CLI, durable inbox, разрешения, recovery, проверку результата и детерминированные сценарии. Есть `test/`, `bench/`, boundary-check и smoke-скрипты. README прямо утверждает независимость от OpenCode, что согласуется с собственным манифестом зависимостей; полный граф импортов ещё не проверен.
- **Интересно изучить дальше:** agent loop, доказательства завершения, восстановление, файловые ограничения и benchmark-сценарии. Богатый UI OpenCode не следует автоматически приписывать этому CLI.

### 8. NexusTest

- **Назначение:** минимальный пример для проверки исправления функции; связь с конкретным агентом не доказана.
- **Технологии:** JavaScript ES modules, встроенные `node:test` и `node:assert/strict`.
- **Главные файлы:** `math.js`, `math.test.js`, `package.json`; запуск теста объявлен как `node --test`. README отсутствует.
- **Состояние:** статически обнаружено расхождение: `add(a,b)` возвращает `a-b`, тест требует `add(2,3) === 5`. Тест не запускался. Это может быть намеренная задача для агента; исправление на этапе аудита не выполнялось.
- **Интересно изучить дальше:** происхождение тестового примера, а не использование в качестве продуктового компонента.

### 9. no-code

- **Назначение:** AI-чат для планирования сайтов, UX, текстов и no-code задач.
- **Технологии:** JavaScript/JSX, React, Vite, browser localStorage, OpenAI-compatible PolzaAI; Vite middleware и serverless API.
- **Точки входа:** `src/main.jsx`, `src/App.jsx`, `src/components/AiStudio.jsx`; серверные `server/aiService.js`, `api/chat.js`, `api/models.js`.
- **Конфигурация и документы:** `package.json`, `vite.config.js`, `.env.example`, README. Наличие `.env` отмечено без чтения значений.
- **Состояние:** README описывает смену концепции с портфолио на AI-чат, историю диалогов и выбор моделей. В манифесте осталось имя `nexus-portfolio`, версия `1.0.0`; scripts тестов не объявлены.
- **Интересно изучить дальше:** простой UX чата, общий AI-сервис для dev/serverless и модельный discovery. По описанию это помощник по планированию, а не доказанная система автоматического создания сайтов.

## Предварительные наблюдения и вопросы следующего этапа

1. **Есть несколько продуктовых направлений:** локальный чат, coding agent, собственные модели/обучение, облачная платформа, IDE/браузер и визуальный редактор. Объединение всего в один runtime пока не обосновано.
2. **Подтверждена только часть связей:** README `NexusCLI/nexus` явно определяет OpenCode как reference; README `Nexus_Ai_site` объединяет сайт, API и IDE, а README браузера описывает общий аккаунт. Это не устанавливает родство с Axiom или Python Nexus.
3. **Историю нельзя вывести из версий:** `5.0.0-beta`, `0.1.0` и `1.0.0` принадлежат разным продуктам. Старейший и новейший проекты пока не установлены. Позднее нужны Git-коммиты, changelog, метаданные снимков и сравнение содержимого; даты копирования файлов ненадёжны.
4. **Есть кандидаты на конфликтующие реализации:** Python CLI и вложенный CLI старого Nexus; старый runtime и новый TS agent loop; localStorage, несколько SQLite-хранилищ и облачный SQLAlchemy; разные model registry и provider adapters. Победитель не выбран: сначала надо сравнить подключение, контракты, тесты и фактическое поведение.
5. **Документация местами отстаёт:** это явно видно у NexusAI v0.018 и по прежнему имени пакета no-code. Документы предыдущих аудитов старого Nexus и сайта необходимо читать как исторические свидетельства и сверять с исходниками.

## Указатель компонентов для будущего сравнения

| Область | Где продолжить исследование |
|---|---|
| CLI | `NexusCLI/nexus/apps/cli`, `cli/minicursor.py`, `Nexus старый проект/nexus/cli`; отдельно OpenCode как reference |
| Agent Core | `NexusCLI/nexus/src/core`, старые `nexus/runtime`, `nexus/kernel`; подключение `cli/agent` ещё выяснить |
| UI | `Axiom/apps/chat`, `Nexus_Ai_site/frontend`, `no-code/src`, `Nexus_Maker/src`; отдельно OpenCode app/tui |
| Модели | Axiom providers/core, `cli/models` и `backends`, NexusCLI llm, облачный API, старый Nexus |
| Файлы и tools | NexusCLI tools/permissions, `cli/tools`, старые `nexus/tools`; IDE extensions; Maker document/import/export |
| Память и контекст | Старый `nexus/memory`, `cli/memory`, облачные memory-сервисы и тесты, NexusCLI context/storage; не смешивать историю чата с долговременной памятью |
| Базы данных | `Axiom/packages/storage`, `NexusCLI/nexus/src/storage`, старый `nexus/storage`, облачный SQLAlchemy |
| Тестирование | Axiom tests, NexusCLI test/bench, cli tests, серверные tests и frontend E2E, Maker геометрия/scene/store |

Это навигационный список, **не рейтинг лучших реализаций и не план переноса**.

## Результат и остановка

Создан только этот краткий структурный отчёт `NEXUS_AUDIT.md`. В дальнейшем он может быть расширен до полного аудита. `NEXUS_ARCHITECTURE.md`, `NEXUS_MIGRATION_PLAN.md` и `NEXUS_ROADMAP.md` пока не создавались: они требуют следующих этапов и выводов, которых первичный обзор ещё не даёт.

Первый этап был остановлен согласно указанию пользователя. После добавления архива `Nexus_Minecraft` карта дополнена следующим addendum.

## Addendum: Nexus_Minecraft

В корне архива появилась папка `Nexus_Minecraft`, содержащая две копии одного Windows desktop-продукта:

```text
Nexus_Minecraft/
├── Nexus_Minecraft/              основная, более новая копия; Python/PySide6, v1.1.4.2
│   ├── app/                       MainWindow и маршрутизация страниц
│   ├── auth/                      offline, Microsoft, Ely.by, OAuth callback
│   ├── core/                      launcher, instances, versions, Java, updater, settings
│   ├── mods/                      Modrinth, modpack, shaders, compatibility
│   ├── storage/                   paths и JSON store
│   ├── ui/                        PySide6 pages/components/styles/locales
│   ├── tests/                     project integrity и security regressions
│   ├── website/                   статический сайт загрузки
│   └── website-next/              React/Vite scaffold, README помечает как неиспользуемый
└── Nexus_minecraft_launcher/      историческая копия, v0.7.13, меньший срез
```

Назначение: Windows-лаунчер Minecraft с отдельными инстансами, Vanilla/Fabric/Forge/NeoForge/Quilt, Modrinth-модами и модпаками, Java/RAM, Microsoft/Ely.by/offline accounts, загрузками и обновлением через GitHub Releases/website metadata.

Технологии и точки входа: Python 3.12+, PySide6, `minecraft-launcher-lib`, requests/urllib, JSON persistence, PyInstaller/Inno Setup; `Nexus_Minecraft/Nexus_Minecraft/main.py` → `app/window.py:MainWindow`. Основные документы — README, INSTALLER/RELEASE/SECURITY regression reports и CI workflow.

Состояние: рабочий MVP/предрелизный desktop-продукт с более зрелой новой копией. `Nexus_Minecraft` содержит более полный launcher pipeline, расширенный UI, loader version handling, Java checks, PKCE/public Ely path и PID-aware updater. Вторая копия — baseline v0.7.13. Live GUI и external network не запускались в текущем окружении: зависимости PySide6, minecraft-launcher-lib, requests и keyring отсутствуют.

Для общей карты: reusable candidates — job/progress state из DownloadManager, instance lifecycle, runtime discovery boundary, process supervision contract, token/provider lifecycle и release verification. Minecraft-specific остаются Mojang/loader/Modrinth, Java rules, JVM command, game accounts, skins/mods и Windows installer. Подробное сравнение и ограничения находятся в [NEXUS_MINECRAFT_ANALYSIS.md](C:/Nexus_History/NEXUS_MINECRAFT_ANALYSIS.md).
