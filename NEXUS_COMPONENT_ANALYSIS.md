# Nexus — анализ компонентов и отбор для версии 1.0

Дата: 9 сентября 2026 года. Архив: `C:\Nexus_History`. Этап 2: архитектура, подключение компонентов и выборочные проверки.

## Главный вывод

**Основа исполнения задач — самостоятельный `NexusCLI/nexus`; основа локального чата и Web UI — Axiom.** Это два источника для интеграции, а не готовый объединённый продукт. Облачные возможности `Nexus_Ai_site`, локальный inference MiniCursor и редактор Maker следует подключать отдельными адаптерами/приложениями, когда они нужны продукту.

Для рекомендаций принято рабочее определение Nexus 1.0: локальный помощник с чатом, coding-agent, CLI, Web UI, заменяемыми провайдерами и долговечным состоянием. Облачный SaaS, обучение собственных моделей, IDE-дистрибутив и браузер не считаются обязательными частями первой версии. При ином продуктовом приоритете порядок переноса изменится.

Нельзя переносить весь архив в Core: одинаковые названия скрывают разные обязанности. Axiom ChatCore не выполняет инструменты; Cloud Agent Loop не является надёжным исполнителем локальных изменений; история диалога, профиль пользователя и векторная память — разные подсистемы.

## Как установлено состояние

Проверены точки входа, composition roots, основные классы и связи моделей, памяти, исполнения, транспорта и хранения. Прочитаны соответствующие тесты и проведены ограниченные проверки на временных копиях исходников. Исторические аудиты использованы как указатели, но выводы сверены с кодом.

Обозначения:

- **Проверен в указанном сценарии** — просмотрена реализация и прошли относящиеся к ней выбранные тесты. Это не сертификация production-ready.
- **Реализован, требует адаптации** — есть исполняемая логика и подключение; целевой контракт отличается или проверок недостаточно.
- **Частичный / дефект** — обнаружены существенные ограничения или расхождения кода и тестов.
- **Заготовка / legacy** — имитация функции, старый путь или совместимый alias; не кандидат на самостоятельное ядро.
- **Не проверен исполнением** — вывод основан на коде; запуск и пользовательский сценарий не подтверждены.

UI не проверялся визуально и браузерные E2E не запускались. Внешние платные LLM, OAuth, billing, реальные коннекторы и GPU-обучение не вызывались. OpenCode исследован адресно как внешний reference, не как полностью перепроверенный монорепозиторий.

## Таблица компонентов

| Компонент | Проект | Состояние | Использовать в Nexus 1.0? |
|---|---|---|---|
| Agent Loop, состояние задачи | `NexusCLI/nexus` | Проверен: provider turns, tools, лимиты, отмена, steering/queue | **Да, основа Core** |
| CompletionPolicy, evidence, verification | `NexusCLI/nexus` | Проверен: отвергает ложное завершение, устаревшие результаты и подмену проверок | **Да, обязательная часть Core** |
| Durable inbox, recovery, ownership | `NexusCLI/nexus` | Проверен: восстановление без слепого повтора действий, блокировка одного workspace | **Да**, с текущими ограничениями на конкуренцию |
| Tool Registry / Executor / Permissions | `NexusCLI/nexus` | Проверен в сценариях allow/ask/deny, смены реализации и ошибок входа | **Да**, единый путь выполнения tools |
| Файловый guard и атомарные изменения | `NexusCLI/nexus` | Проверен: traversal, junctions, stale hash, ограничения путей | **Да**, не объявлять защитой произвольного shell |
| OpenAI-compatible tool-calling adapter | `NexusCLI/nexus` | Проверен локальным HTTP: streaming/non-streaming, сборка calls, retry | **Да**, базовый coding-провайдер |
| Реестр многих подключений/моделей | `NexusCLI/nexus` | Есть ModelConfig с capabilities; полноценного UI/catalog управления нет | **Дополнить** модельным каталогом из Axiom |
| ContextManager / compaction | `NexusCLI/nexus` | Проверен сценарий overflow; эвристический бюджет и детерминированное сокращение | **Да, после уточнения контракта бюджета** |
| SQLite Store / migrations | `NexusCLI/nexus` | Проверен restart, ownership, атомарность inbox, optimistic version | **Да**, хранилище исполнения |
| NexusAPI | `NexusCLI/nexus` | Рабочая внутрипроцессная граница; это не HTTP API | **Да**, за ней построить транспорт |
| CLI | `NexusCLI/nexus` | Подключён к NexusAPI; команды sessions/resume/inspect/permissions | **Да**, основной CLI; UX проверить отдельно |
| ChatCore | Axiom | Проверены поток, остановка, редактирование, повтор, блокировка диалога | **Да**, отдельный chat use case |
| ProviderRegistry, подключения и Model | Axiom | Проверены регистрация, ошибки; идентичность включает подключение и ID модели | **Да**, основа каталога |
| Chat provider, SSE, deadlines | Axiom | Проверены HTTP, discovery, SSE, отмена и idle timeout | **Да**, с расширением для tool exchanges |
| Бюджетирование истории | Axiom | Проверены целые ходы, закреплённые инструкции, отказ до записи | **Да**, как chat-политика и источник общих тестов |
| SQLite ChatRepository | Axiom | Проверены миграции, rollback, восстановление незавершённого ответа | **Да**, адаптировать под общий runtime и границы данных |
| SecretStorage | Axiom | Проверено шифрование файла и восстановление; OS backend пока не реализован | **Да, условно**; интерфейс переносить, backend выбрать явно |
| Express API | Axiom | Проверены input/origin, API чата, работа с секретами | **Да**, основа локального HTTP-слоя, не публичного SaaS |
| React Web UI | Axiom | Подключён к API, отделён от provider SDK; E2E этого аудита не было | **Да**, предпочтительная стартовая оболочка |
| ModelManager, GGUF, CUDA backend | `cli` / MiniCursor | Реальный load/chat/unload; проверки частично проходят, thinking расходится | **Опционально**, отдельный Python inference-адаптер после исправления контракта |
| SettingsManager | MiniCursor | Валидация, profiles, fsync + replace; дефолт thinking не совпадает с тестом | **Выборочно**, идеи/тесты конфигурации; не второй глобальный settings store |
| QLoRA training | MiniCursor | Выделены manager/worker/dataset; GPU-сценарий не перепроверен | **Нет в Core 1.0**; отдельная лаборатория |
| Agent / Planner / Router | MiniCursor | Фиксированный план и keyword routing; не подключены к MiniCursor runtime | **Нет** |
| JSON Memory / простые tools | MiniCursor | Перезапись history.json, неатомарная; минимальные filesystem/shell helpers | **Нет**, дублируют более сильные реализации |
| ModelManager / accounts / provider factory | Старый Python Nexus | Подключены к runtime, есть native adapters и discovery; выбранные тесты проходят | **Выборочно**, спецификации, сценарии и отдельные адаптеры |
| ModelRouter | Старый Python Nexus | Keyword/capability routing; fallback может выбрать неподходящую модель | **Не переносить политику как есть** |
| AgentExecutor + OrchestraRuntime | Старый Python Nexus | Реальная оркестрация, tools, repair; 29 выбранных тестов общего набора проходят | **Не как основное ядро**; сохранить полезные сценарии |
| SecurityGate / завершение runtime | Старый Python Nexus | Decision записывается, но run_task не блокируется; COMPLETED выставляется после возврата | **Нет без переработки** |
| MemoryManager | Старый Python Nexus | Подключён, есть token matching; short/long/project в памяти процесса | **Только идею scopes**, не реализацию долговременного хранения |
| VectorMemory / Database | Старый Python Nexus | search возвращает все элементы; Database — словарь Python | **Нет** |
| CLI Typer/Rich | Старый Python Nexus | Теперь вызывает runtime, управление моделями реально подключено | **Выборочно UX-команды**, не второй CLI runtime |
| WebBackend / NexusServer | Старый Python Nexus | health-словари без HTTP-сервера | **Нет** |
| Cloud model registry | `Nexus_Ai_site` | Реальные normalizer/cache/discovery; тесно связан с тарифами и Polza/OpenRouter | **Выборочно**, вынести нормализацию из коммерческой политики |
| User memory + auto-learn | `Nexus_Ai_site` | SQL-хранение и подключение к запросу; текстовый профиль, выбранные тесты проходят | **Да, переработать в MemoryRepository/сервис профиля** |
| Connector Agent Loop | `Nexus_Ai_site` | Реальные tool calls, максимум 6 шагов; без durable action recovery | **Как адаптер**, не второй Agent Core |
| FastAPI cloud API | `Nexus_Ai_site` | Рабочие routers и сервисы; весь сервер/прод не проверялись | **Вне локального Core**, сохранить для облачной редакции |
| SQLAlchemy DB / chat persistence | `Nexus_Ai_site` | Пользовательские сущности, JSON истории, SQLite/PostgreSQL; ручные schema changes | **Вне локального Core**, отдельный cloud repository |
| Большой React frontend | `Nexus_Ai_site` | Реальные chat/sync/model hooks, зависимости от auth/tariffs/connectors | **Выборочно UI-компоненты**, не переносить приложение целиком |
| Локальный IDE backend | `Nexus_Ai_site/backend` | FastAPI routes, исполнение инструментов, проверка workspace путей | **Не как второй executor**; будущий клиент единого Core |
| Code-OSS IDE / Electron Browser | `Nexus_Ai_site` | Реальные extension/IPC точки входа; сборка и end-to-end не проверены | **Позже, отдельные клиенты**, не часть Core |
| Geometry / scene / layout | Nexus Maker | Соответствующие тестовые файлы проходят | **Опциональный Editor SDK**, не Agent Core |
| Editor Store / grouping | Nexus Maker | **Дефект**: parentId не устанавливается для group | **После исправления**, только для редактора |
| Editor API / .nexus document IO | Nexus Maker | Рабочая обёртка над Zustand; браузерный IO, поверхностная проверка JSON | **После отделения store и усиления валидации** |
| AI service / Chat UI | `no-code` | Реальный HTTP-вызов; сериализация истории в prompt, localStorage, без streaming | **Только продуктовые тексты/UX**, не ядро чата |
| NexusAI models/tokenizers/trainer | `Create_my_AI_NEXUSAI` | Исполняемые исследовательские реализации; общий loader покрывает старые WordContext-типы | **Нет в Core 1.0**, сохранить R&D отдельно |
| Минимальная add/test задача | NexusTest | Намеренность ошибки не установлена; add выполняет вычитание | **Только fixture**, никогда библиотека арифметики |
| OpenCode LLM / V2 / UI / server | Родительский `NexusCLI/packages` | Сложная внешняя архитектура; V2 содержит явные TODO, весь snapshot не прогонялся | **Reference**, не переносить монорепозиторий целиком |

## 1. Система моделей: что объединять

### Каталог и выполнение — разные задачи

В Axiom `packages/shared/src/index.ts` задаёт Model с независимыми ID подключения и модели; `packages/core/src/registry.ts` создаёт провайдер из конфигурации. Это более подходящая основа пользовательского каталога, чем один текущий ModelConfig NexusCLI. Сохранить трёхзначную семантику capabilities: поддерживается / не поддерживается / неизвестно. Успешный `/models` не доказывает tool calling или доступность генерации.

Для исполнения coding-запросов сильнее текущий `NexusCLI/nexus/src/llm/openai-compatible.ts`: восстановление фрагментов tool arguments, контроль finish reason, запрет выполнения усечённых calls, ограниченные повторы 429/5xx. Axiom `packages/providers/src/openai-compatible.ts` умеет текст, текстовые файлы и изображения, но на остальных типах частей выбрасывает ошибку. Наличие tool-call в общих типах Axiom **не означает** его поддержку адаптером.

**Решение:** единые Provider/Model/GenerationEvent контракты, каталог из Axiom и tool-calling тракт из NexusCLI. До объединения необходимы тесты текстового потока, image parts, tool-call/result, отмены, таймаутов и неполного ответа. Не складывать два SSE-парсера в публичный API; выбрать общий transport helper после сравнения контрактов, оставить специализированную обработку протокола.

### Старый Nexus полезнее, чем утверждают его прежние документы

`nexus/models/manager.py` управляет модельными записями и provider accounts; `factory.py` действительно создаёт OpenAI, Anthropic, Gemini, Ollama, LM Studio и OpenAI-compatible адаптеры. `models/router.py` уже является compatibility alias к `model_router.py`, а не самостоятельным третьим движком.

При этом `choose_for_capabilities()` при отсутствии совместимых моделей возвращает текущую или обычный fallback. Для обязательных tools это неприемлемый контракт: выбор должен явно сообщать «совместимой модели нет». Старые provider тесты используют подменённый HTTP; они подтверждают внутреннее поведение, не совместимость с актуальным внешним API.

**Перенести выборочно:** сценарии нескольких аккаунтов одного провайдера, discovery, нормализацию идентификаторов, provider-specific тестовые примеры. Python-реализации не копировать прямо в TypeScript Core; при необходимости оставить отдельный адаптер или перенести протокол с тестами.

### Локальные модели и облачный каталог

MiniCursor `models/manager.py` и `backends/llama_cpp.py` реализуют управление GGUF/CUDA. Сохранить как опциональный backend со своим процессом и жизненным циклом; не заставлять каждый пользовательский клиент устанавливать PyTorch/Unsloth. Четыре тестовых расхождения thinking перечислены ниже; до их разрешения интеграция условная.

Облачный `app/services/models_registry.py` сочетает нормализацию Polza, OpenRouter, кэш на диске, актуализацию и коммерческий доступ. **Извлекать normalizer и правила метаданных отдельно** от TIER_MODEL_CEILING, курса валют и тарифов. Эти политики не относятся к универсальному Nexus Core.

`Create_my_AI_NEXUSAI/nexusai.py` загружает только WordContextModel и WordContext8Model. Наличие GPT016/017 и train_v018 не делает этот loader универсальным. Trainer выполняет настоящий training step, но качество модели и переносимость обучения не подтверждены; это R&D, не источник production inference для 1.0.

## 2. Память: три независимых слоя

| Слой | Подходящий источник | Ограничение |
|---|---|---|
| История диалогов/задач | Axiom ChatRepository + NexusCLI Store | Разные схемы и жизненные циклы; нужен явный mapping |
| Рабочий контекст одного запуска | NexusCLI ContextManager; Axiom RecentTurnsContextBuilder | Оба эвристические, не точные tokenizer budgets |
| Долговременный профиль пользователя | Cloud user_memory | Сейчас один ограниченный текстовый документ, без семантического индекса |

В старом Nexus `MemoryManager` действительно подключён к runtime и умеет ранжировать совпадения слов. Но `MemoryStore` держит Python list, а `ProjectMemory` — данные процесса. Название `long_term` не обеспечивает сохранение после перезапуска. `VectorMemory.search(query)` игнорирует query и возвращает весь список; использовать как векторную БД нельзя.

В MiniCursor `memory/manager.py` переписывает JSON целиком без транзакции/блокировки; runtime импортирует SettingsManager, ModelManager и TrainingManager, а не этот Memory или Agent. Следовательно, наличие history.json не доказывает интегрированную память чата.

Cloud `app/services/user_memory.py` работает с `UserMemoryDB`, ограничивает профиль 8000 символами, поддерживает enabled/auto_learn; `routers/memory.py` фиксирует изменения транзакцией, `routers/ai.py` вставляет память в запрос. Это реальная функция. Но текст памяти вводится как system message; при переносе нужны происхождение фактов, область действия, исправление/удаление пользователем и отделение сохранённых сведений от полномочий агента. Auto-learn не должен автоматически менять разрешения tools.

**Рекомендация:** в 1.0 — история, ограниченный рабочий контекст и редактируемые заметки/профиль с persistence. Не объявлять RAG/векторную память готовыми. Не смешивать профиль, журнал действий и transient cache в одну таблицу `memory`.

## 3. Agent Loop и выполнение инструментов

### Почему выбран самостоятельный NexusCLI

В `src/composition.ts` создаются Store, PermissionEngine, ToolExecutor, VerificationEngine, registry и AgentLoop. В `src/core/agent-loop.ts` видна последовательность: получить владение → recover → принять steering → проверить лимиты → вызвать provider → полностью собрать turn → выполнить tools → записать результаты → проверить цель. Завершение решает `src/completion/policy.ts`, а не строка ответа модели.

Проверки подтвердили независимость completion от произвольного COMMAND_RESULT, актуальность evidence относительно fingerprint, запрет подмены goal harness и блокировку неопределённых side effects. `src/recovery/policy.ts` не повторяет автоматически прерванный процесс; запись файла может быть сверена с сохранённым after-hash.

**Ограничения перед интеграцией:**

- Одна владеющая сессия на workspace в рамках общего data store. Разные data directories не создают глобальную блокировку одного workspace; это следует закрепить в конфигурации продукта.
- Это не кластерный scheduler. Владение использует PID/token; повторное использование PID может консервативно блокировать запуск.
- Для произвольной coding-цели нужны доверенная goal-check или пользовательское подтверждение. Автоматическое воспроизведение проваленного теста включается для ограниченного шаблона запроса.
- Контекст сравнивает UTF-8 byte length с величиной, рассчитанной из contextLength/maxOutputTokens; это эвристика с консервативным поведением, а не полноценный token accounting. Compaction сохраняет ограниченный summary, полная история остаётся в SQLite.
- Текст provider turn собирается в `parts` до записи assistant; готового интерфейса живых token-delta для Web UI в этом пути нет. Его нужно явно добавить в общий event contract.
- Файловые guards не изолируют разрешённый произвольный процесс на уровне ОС.

### Почему не старый runtime

Старый `nexus/core/runtime.py` теперь реально собирает AgentExecutor, OrchestraRuntime, модели, инструменты и память. `nexus/agents/executor.py` содержит allowlist и ограниченный tool loop, включая извлечение неявных действий из текста/блоков кода. Это уже не пустой прототип.

Однако на пути `run_task()` результат `self.security.check(prompt)` записывается в audit, после чего оркестратор вызывается без ветки отказа/ожидания approval. `nexus/tools/registry.py` также непосредственно вызывает `tool.execute()`. После возврата оркестратора runtime выставляет `task.status = 'COMPLETED'` без проверки результата verification. `nexus/orchestra/verifier.py` проверяет статусы и `ok=False`, но не доказывает исходный пользовательский сценарий независимой проверкой.

Это достаточные причины **не выбирать старый runtime основой Nexus 1.0**, несмотря на проходящие выбранные тесты. Сохранить роль-ориентированное планирование, граф зависимостей, activity events и тестовые сценарии как материал для последующего развития. Не переносить regex-превращение текста модели в запись файла как стандартный протокол tools.

### Остальные циклы

MiniCursor `agent/agent.py` возвращает фиксированный план и статус `ready for model backend`; это заготовка. Cloud `connector_agent_loop.py` выполняет до шести tool-turns, изменяет массив messages и затем передаёт ответ финальной модели. Он пригоден как облачный сценарий коннекторов, но не даёт durable ledger/UNKNOWN recovery для локальных side effects.

Локальный backend сайта и IPC браузера также исполняют действия. В будущей системе они должны обращаться к общему permission/tool contract, а не создавать ещё два независимых центра принятия решений.

OpenCode `packages/core/src/session/runner/llm.ts` содержит явные незавершённые пункты: terminal status, часть tool context/cancellation settlement, maintenance и durable continuation recovery. `packages/llm` отделяет Protocol, Endpoint, Auth и Framing, но требует Effect и связанных типов. Использовать как reference или отдельную осознанную зависимость; зрелость внешнего продукта не доказывает готовность каждого нового V2-модуля архивного snapshot.

## 4. CLI, Web UI и API

**CLI:** выбрать `NexusCLI/nexus/apps/cli`, потому что он работает через NexusAPI и отражает состояния исполнения. Из старого Typer/Rich CLI взять UX управления provider accounts, диагностику и обзор activity. MiniCursor CLI оставить только сервисным интерфейсом локальных моделей. Пользователь не должен иметь три команды `nexus` с разными конфигами и несовместимыми session IDs.

**Web UI:** Axiom — предпочтительный исходный клиент: `apps/chat/src/App.tsx` использует `api/stream`, общие типы и компоненты, не обращаясь к провайдерам напрямую. Это вывод по границам кода, а не результат визуального сравнения. Его HTTP-транспорт NDJSON и chat-события нужно сопоставить с agent-событиями; текущую логику отмены и partial persistence сохранить.

Сайт Nexus богаче функционально: `ChatPage.jsx` связан с `useNexusChat`, `useCloudChatSync`, auth, memory, models и connectors. Но эти зависимости повышают стоимость извлечения. `IdeApp.jsx` — около 100 КБ исходного JSX; простое копирование принесёт большой связанный UI. Переносить выборочно ModelPicker, Markdown/Thinking/Source-компоненты и UX activity после отделения от cloud hooks. Наличие красивого UI само по себе не доказывает готовность engine.

`no-code` действительно вызывает `server/aiService.js` через Vite middleware/serverless `api/chat.js`; ответ приходит целиком JSON, без streaming. История в UI преобразуется в строковый prompt и затем ограничивается сервером; это не каноническая роль-ориентированная история. Сохранить тексты сценариев и простоту интерфейса, не переносить persistence/provider слой.

**API:** `NexusCLI/nexus/src/api.ts` — внутрипроцессный TypeScript-интерфейс. HTTP boundary брать за образец из Axiom, добавляя sessions, actions, evidence, permission replies и события. Axiom API рассчитан на loopback, проверяет host/origin/client header; это не заменяет аутентификацию при публикации в сеть. Cloud FastAPI оставить отдельно: аккаунты, платежи, синхронизация и connector credentials не должны проникать в Core.

Старые `nexus/api/server.py` и `nexus/web/backend.py` только возвращают health dict; их не включать в новый API. Code-OSS extensions и Electron Browser оставить будущими клиентами, без обязательной зависимости Core от VS Code/Electron.

## 5. Хранилище и секреты

NexusCLI использует `bun:sqlite`, Axiom — `node:sqlite`. **Два адаптера нельзя механически объединить:** сначала выбрать поддерживаемый host runtime. Для сохранения текущего исполняющего ядра разумный исходный выбор — Bun; Axiom storage тогда требует адаптации. Альтернатива Node допустима, но потребует замены Bun API в NexusCLI. Совместимость Node SQLite с Bun не предполагается без проверки.

Сохранить логические порты ChatRepository, SessionStore, ConfigurationRepository, MemoryRepository и SecretStorage. На первом локальном этапе они могут работать в одном SQLite-файле через согласованную схему, но таблицы чата и action ledger имеют разные обязанности. Не запускать существующие миграторы двух проектов по очереди над одной БД: у них независимая история schema versions.

NexusCLI: WAL, synchronous FULL, foreign keys, busy timeout, транзакции, optimistic version, журнал действий и inbox. Ограничение: session хранится крупным JSON, а `save()` повторно проецирует историю сообщений; масштабирование длинных задач требует измерений и дальнейшей нормализации. Мигратор сейчас создаёт версию 1 — это не доказательство готовности будущих upgrades.

Axiom: версионированные миграции, сохранение message parts и восстановление `generating → aborted`; проверены rollback и переход со старой схемы. Перенести эти сценарии сохранности данных независимо от выбранного драйвера.

Cloud: `app/database.py` содержит SQLAlchemy-сущности, `ChatConversationDB.messages_json` и `migrate_schema()` с `create_all`/ручными ALTER TABLE. Это реальный storage, но ручное обновление схемы не следует переносить как универсальный migration engine. Redis/cache/hydration и PostgreSQL относятся к облачной архитектуре; без deployment-проверок нельзя объявлять их отказоустойчивыми.

Для секретов взять интерфейс Axiom и исключить хранение API-ключей в общих messages/config JSON. Реализован только encrypted-file backend; ключ шифрования хранится рядом с ciphertext. OS keychain/DPAPI — будущий адаптер, а не готовая функция. Текущий подход NexusCLI через имя env-переменной также сохранить как допустимый backend. Пользовательские БД и секреты в ходе аудита не читались.

## 6. Editor и исследовательские компоненты

Maker имеет ценные самостоятельные geometry, coordinates, scene и layout-модули. Однако `editor/api/editorApi.ts` вызывает глобальный Zustand store: это ещё не независимый headless Editor API. `document/projectIO.ts` использует File/Blob/document и проверяет только верхний уровень формата, версии, objects/order. Для agent-доступа нужны отдельная модель документа, полная валидация входа, проверка связей сцены и общий permission wrapper.

**Подтверждённый дефект:** `store/editorStore.ts`, `groupSelected()` создаёт group и вызывает `reparentPatch`. В `editor/scene/sceneGraph.ts:30` родитель допускается только с `type === 'frame'`; group отвергается. Поэтому у ребёнка остаётся `parentId: null`, что и обнаружил тест. До исправления нельзя объявлять grouping/ungrouping готовыми.

NexusAI trainer/tokenizers и MiniCursor QLoRA выделить в R&D/Training. Веса, датасеты и training environment не должны входить в обязательную поставку Core. NexusTest сохранить как маленькую задачу для оценки агента, если подтвердится такое назначение.

## 7. Дублирования и окончательный выбор

| Дублирование | Выбор и причина |
|---|---|
| Axiom ChatCore / NexusCLI AgentLoop / старый Nexus / cloud loop | Два use case — Chat и Task — поверх общих контрактов; исполнение tools только через NexusCLI-derived executor |
| Каталоги Axiom / старого Nexus / Cloud | Axiom — identity/configuration; старый Nexus — account/discovery scenarios; Cloud — нормализация и отдельная access policy |
| Три OpenAI-compatible реализации + OpenCode protocols | Канонический provider contract; tool-call тракт NexusCLI и chat/timeouts Axiom объединить через contract tests, не через цепочку fallback-обёрток |
| MemoryStore / JSON history / localStorage / SQL | SQLite как источник истины локальных данных; UI localStorage только настройки/кэш, cloud — отдельная синхронизация |
| Разные permissions и executors | NexusCLI PermissionEngine + ToolExecutor; старый SecurityGate не переносить как действующую защиту |
| Typer CLI / MiniCursor CLI / NexusCLI | NexusCLI — основной; модельные команды адаптировать, training вынести |
| Axiom React / сайт React / no-code React / OpenCode Solid | Axiom как стартовая оболочка, UI сайта выборочно; не вводить второй frontend framework ради копирования reference |
| SQLite migrations Axiom / NexusCLI / cloud ALTER | Единая новая схема и последовательность миграций; импорт старых данных отдельными конвертерами |
| Старые router/engine aliases и вложенный cli/cli | Не создавать вторые реализации; compatibility оставить только при доказанном внешнем потребителе |

## 8. Что исключить из будущей версии

«Исключить» означает **не переносить в новую поставку**, а не удалить из архива.

1. Заготовки `cli/agent`, неподключённую JSON memory и примитивные shell/filesystem helpers MiniCursor.
2. Старые in-memory Database/VectorMemory и health-only API/Web. Не выдавать их за persistent database, vector search или HTTP API.
3. Неиспользуемые legacy CLI/loop, version manifests и декоративные subsystem stubs старого Nexus. Перед физическим исключением в новом дереве проверить imports и пользователей compatibility aliases; не удалять каталоги вслепую по имени.
4. Вторые независимые permissions/execution loops, implicit tool execution из произвольного текста и completion по одному лишь статусу/ответу модели.
5. Полный reference-монорепозиторий OpenCode, его console/stats/infra/artifacts и альтернативный Solid UI как обязательную зависимость собственной минимальной версии. Если позже берётся код — сохранить provenance и notices.
6. Billing, OAuth, тарифы, курсы валют, Redis hydration, Telegram и deployment-политику из локального Core. Их функциональность можно сохранить в отдельном cloud-приложении.
7. Code-OSS/VSCodium-сборку, Electron Browser и Maker из обязательного Core runtime. Это отдельные продукты/клиенты, не «мусор».
8. Training datasets/weights, окружения, node_modules, caches, build/dist-снимки и ZIP прошлых версий из новой исходной архитектуры. Архив сохраняется полностью.
9. `NexusTest/math.js` как production utility; ошибочная функция допустима только в явно обозначенном benchmark fixture.

## 9. Результаты проверок

Все проверки выполнялись на временных копиях в `C:\Users\dobrynya\AppData\Local\Temp\nexus-component-audit-fd80567986b846d1b3400f904a91c698`. Использовались уже установленные зависимости, без установки пакетов. Для Python отключены bytecode/cache pytest; исходники, конфигурация и пользовательские данные архива не исправлялись. Временные копии сохранены.

| Проект | Проверка | Результат | Что результат не доказывает |
|---|---|---|---|
| NexusCLI/nexus | Bun 1.3.14: `bun test ./test` | **46 passed, 0 failed**, 5 файлов | Реальную успешность произвольных coding-задач на внешней LLM, GUI и масштабирование |
| Axiom | Node 24.19.0: сборка workspace packages и `tsx --test tests/*.test.ts` | **32 passed, 0 failed** после настройки ссылок копии | Browser E2E, внешние модели и публичный multi-user deployment |
| Старый Nexus | pytest: agent_execution, orchestra, model_router, models_providers, models_registry, tools | **29 passed, 0 failed** | Полный набор проекта, корректность общей permission/completion политики, живые native API |
| MiniCursor | pytest: settings, runtime, models, backend | **24 passed, 4 failed** | Реальную CUDA-генерацию, GPU-память и QLoRA training |
| Nexus Cloud | pytest: user_memory, memory_auto_learn, connector_agent_loop, polza_models_registry | **15 passed, 0 failed** | Весь API, live billing/OAuth/коннекторы и надёжность deployment |
| Nexus Maker | Vitest 4.1.11: `vitest run` | **24 passed, 1 failed**, 5 файлов | Полный UI, импорт/экспорт и сохранение в браузере |
| no-code, NexusAI, NexusTest, OpenCode, IDE/Browser | Статическое изучение выбранных путей | Исполнение не проверено | Нельзя присваивать им статус «тесты прошли» |

### Обнаруженные расхождения

**Axiom — переносимость окружения.** В архивном `node_modules/@axiom` junctions ведут в `C:\Axiom\...`. Первая временная копия использовала source aliases и провалила plain-Node package boundary test: `ERR_MODULE_NOT_FOUND @axiom/shared`. Во второй копии созданы корректные локальные workspace links и собраны packages; все 32 теста прошли. Это не ошибка ChatCore, но скопированное окружение нельзя считать переносимой установкой. Архивные ссылки не менялись.

**MiniCursor — thinking contract.** Падают:

- `test_defaults_and_backend_option_mapping`;
- `test_top_level_thinking_commands_toggle_and_report_status`;
- `test_chat_think_commands_change_mode_without_becoming_messages`;
- `test_manager_forwards_current_thinking_setting_on_every_turn`.

Тесты ожидают thinking=True по умолчанию и команды переключения. В `config/settings.py` дефолт False; текущий runtime не содержит ожидаемого пути этих команд. Часть сообщений `/think` в тесте попадает в чат вместо переключения. Это подтверждённое расхождение реализации и тестового контракта; без решения о желаемом поведении нельзя утверждать, что неверен только код или только тесты.

**Maker — реальный дефект группировки.** `editorStore.test.ts:38`: ожидается groupId, получен null. Причина проверена в `sceneGraph.ts:30`, описана выше. Предупреждение об отсутствии browser localStorage в Node есть, но оно не объясняет явный запрет group в reparentPatch.

**Старый аудит устарел.** Утверждения `docs/TECHNICAL_DEBT.md` о неподключённом CLI и отсутствующем ToolRegistry.get() больше не соответствуют коду. Однако некоторые заготовки памяти/API сохранились. Следовательно, старые оценки количества stubs и покрытия тестами не переносились в этот отчёт как факты.

## 10. Что можно брать сейчас и что блокирует интеграцию

**Можно брать как проверенные исходные компоненты:** NexusCLI AgentLoop/ledger/permissions/recovery/verification, Axiom chat lifecycle/provider registry/context policy/storage migration tests, отдельные geometry/layout Maker. «Брать» означает переносить с контрактами и тестами, а не объявлять готовым объединённый Nexus.

**Перед единой версией обязательно:** выбрать Bun/Node host; согласовать модель сообщений и streaming events; объединить catalogue и tool capabilities; определить схему БД и импорт данных; добавить HTTP-операции задач/разрешений; исправить Maker grouping, если редактор включён; разрешить thinking contract, если включён MiniCursor. Memory auto-learn и cloud connectors переносить только через явные адаптеры.

Итоговый выбор: **NexusCLI даёт механизм исполнения, Axiom — механизм чата и основу интерфейса; остальные проекты дают отдельные возможности, тестовые сценарии и опыт.** Ни один существующий проект целиком ещё не является готовым объединённым Nexus 1.0.

## Addendum: Nexus_Minecraft

Добавлен отдельный анализ [NEXUS_MINECRAFT_ANALYSIS.md](C:/Nexus_History/NEXUS_MINECRAFT_ANALYSIS.md). В сводной таблице компонентов он занимает роль прикладного desktop-клиента и поставщика platform patterns:

| Компонент | Проект | Состояние | Использовать в Nexus 1.0? |
|---|---|---|---|
| Download task ledger | `Nexus_Minecraft/Nexus_Minecraft` | JSON persistence, atomic replace, process-wide lock, progress/finish/fail; нет multi-process lock и schema migrations | **Да, после переноса на transactional job store** |
| Version catalog | `Nexus_Minecraft/Nexus_Minecraft` | Thin retrying wrapper вокруг `minecraft-launcher-lib`; releases/snapshots, без cache/cancellation | **Только интерфейс**, Minecraft adapter отдельно |
| Instance lifecycle | `Nexus_Minecraft/Nexus_Minecraft` | Изолированные `.minecraft`, import/export, path checks, last played; абсолютные пути и JSON без migrations | **Частично**, generic project/workspace lifecycle |
| Java Runtime Manager | `Nexus_Minecraft/Nexus_Minecraft` | PATH/JAVA_HOME/Program Files/Minecraft runtime discovery, major checks, inherited manifest parsing | **Интерфейс да**, Java/Minecraft implementation adapter |
| Launcher / process | `Nexus_Minecraft/Nexus_Minecraft` | Рабочий MVP pipeline, но монолитный method, Popen не персистится, stop/kill/output lifecycle ограничены | **Только после переписывания** |
| Auth/account manager | `Nexus_Minecraft/Nexus_Minecraft` | Offline + Microsoft + Ely PKCE/refresh; tokens в открытом JSON | **Контракты**, не storage/провайдеры как есть |
| Update manager | `Nexus_Minecraft/Nexus_Minecraft` | GitHub + website fallback, temp download, SHA-256 optional, PID-aware installer | **Частично**, checksum/signature сделать обязательными |
| PySide6 launcher UI | `Nexus_Minecraft/Nexus_Minecraft` | Связанные страницы и workers, внешний desktop UI | **Нет в Core**, оставить клиентом |
| Historical launcher copy | `Nexus_Minecraft/Nexus_minecraft_launcher` | v0.7.13, меньше модулей и старые auth/launcher/updater paths | **Нет как основа**, только regression baseline |

Решение по дублированию: основной источник — новая `Nexus_Minecraft` v1.1.4.2; `Nexus_minecraft_launcher` не развивать параллельно. Не переносить в Core Minecraft-specific loader/Modrinth/JVM/skins/installer code, plaintext OAuth token files, permissive update fallback или весь PySide6 UI. Переносить только проверенные контракты состояния задач, instance lifecycle, runtime resolution, process supervision и release verification после усиления persistence, cancellation, security и migrations.
