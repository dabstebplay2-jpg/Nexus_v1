# Nexus v0.2 — Product Layer Plan

Дата: 2026-09-09
Ветка реализации: `nexus-v0.2` (от `nexus-v0.1`)
Базовая линия: 66 тестов, 6 проверок (`typecheck`, `boundaries`, `test`, `bench`, `build`, `smoke`) — все PASS.

Назначение документа: превратить проверенное ядро Nexus в работающий продукт, **не изменяя Agent Core, Verification Engine и Completion Policy**.

---

## 0. Главный принцип, который продуктовый слой обязан сохранить

Ядро уже реализует правило: **завершение авторизует только `completionPolicy`, а не текст модели.**

Продуктовый слой не имеет права:

- показывать «Готово», если `session.status !== "COMPLETED"`;
- скрывать состояние `UNKNOWN` или выдавать его за успех/провал;
- вычислять собственный вердикт вместо `session.decision`.

UI — это **рендерер доказательств**, а не второй источник истины. Любой экран получает данные только из `NexusAPI`.

---

## 1. Текущая архитектура (по факту, ЭТАП 1)

### 1.1. Расположение ядра

Ядро находится не в корне репозитория, а в `NexusCLI/nexus/`. Корень репозитория — снимок экосистемы (`Axiom/`, `cli/`, `no-code/`, документы `NEXUS_*.md`).

```
NexusCLI/nexus/
├── src/
│   ├── api.ts                  # NexusAPI — граница UI
│   ├── composition.ts          # единственный composition root: createNexus()
│   ├── domain/{types,ports}.ts # Domain: типы + порты (Store, Provider, EventSink, ...)
│   ├── core/{agent-loop,state} # Agent Loop + машина состояний + publish()
│   ├── completion/{policy,intent}
│   ├── verification/{engine,delta,integrity}
│   ├── context/{manager,tokens}
│   ├── planner/plan.ts
│   ├── git/{baseline,changes}
│   ├── tools/{registry,builtin,executor,process,workspace}
│   ├── llm/openai-compatible.ts
│   ├── storage/{sqlite,migrations}
│   ├── permissions/engine.ts
│   ├── project/{detect,retrieval}
│   ├── loop-guard/policy.ts, recovery/policy.ts, session/inbox.ts
│   ├── config/config.ts
│   └── shared/{errors,redact}
├── apps/cli/{index,terminal,report}.ts
├── script/{check,boundaries,build,smoke}.ts
├── bench/{run,oracle}.ts
└── test/*.test.ts              # 66 тестов
```

### 1.2. Точка интеграции CLI ↔ ядро (найдена)

Единственная точка интеграции — **`createNexus()` из `src/composition.ts`**, возвращающая `NexusAPI`:

```ts
const api = await createNexus({
  dataDir,            // где живёт SQLite
  provider?,          // Provider — внедряется (в тестах ScriptedProvider)
  store?,             // Store — внедряется
  rules?,             // Rules для PermissionEngine
  permission?,        // PermissionReply — как спрашивать разрешение у человека
  onEvent?,           // EventSink — весь поток событий агента
})
```

`NexusAPI` (`src/api.ts`) — полный контракт для любого клиента:

| Метод | Назначение |
|---|---|
| `create({workspace, goal, model, mode, budgets, goalCheck})` | создать сессию |
| `run(id, signal)` | выполнить Agent Loop (возвращает финальную `AgentSession`) |
| `prompt(id, text, delivery)` | STEER / QUEUE ввод во время работы |
| `sessions()` | список сессий (история задач) |
| `diff(id)` | патчи изменённых файлов + неатрибутируемые процессы |
| `inspect(id)` | session, actions, evidence, events, inputs, turns, epochs, verification |
| `assertGoal(id, note)` | ручное подтверждение сценария |
| `resolveAction(id, actionId, outcome, note)` | разбор UNKNOWN-действия |
| `trustChecks(id, note)` | повторное доверие изменённому harness |
| `close()` | закрыть store |

**Вывод:** CLI (`apps/cli/index.ts`) — это уже «клиент №1» поверх `NexusAPI`. Веб-серверу не нужен новый мост в ядро: он становится «клиентом №2» на той же границе. Это ключевое решение всего v0.2.

### 1.3. Поток событий

`publish()`/`transition()` в `src/core/state.ts` пишут событие в store и отдают в `EventSink`. Фактические типы событий, которые уже эмитит ядро:

`created`, `state`, `model_request`, `usage`, `tool`, `loop_guard`, `completion`, `error`, `permission`, `recovery`, `trust_checks`.

Все события уже проходят через `safeJson`/`redact` — секреты не утекают в UI. **Стрим для веба строится на этом же наборе, новых событий ядра не вводим.**

### 1.4. Существующая система отчётов

`apps/cli/report.ts` формирует финальный отчёт из пяти секций — ровно те, что требует EXECUTION VIEW:

`PLAN` → `CHANGES` → `VERIFICATION` → `EVIDENCE` → `RESULT` (+ `SUMMARY` / `MODEL PROPOSAL (UNVERIFIED)`).

Проблема для продукта: функция возвращает **текст с ANSI-кодами**, а UI нужны структурированные данные.

### 1.5. Архитектурные ограничения, которые нельзя нарушить

`script/boundaries.ts` — это работающий гейт, он сканирует `{src,apps}/**/*.ts` и падает при:

1. импорте, содержащем `packages/` или `opencode` → «OpenCode runtime dependency»;
2. импорте инфраструктуры из `src/domain/`;
3. импорте `storage/sqlite`, `llm/openai`, `apps/`, `composition` из `src/core/`;
4. `import * as` и переименовании `import { x as y }`;
5. циклических импортах.

**Пункт 1 напрямую запрещает предложенную структуру `packages/shared`, `packages/ui`, `packages/api`,** если из неё импортировать в `src`/`apps`.

---

## 2. Что остаётся неизменным

Полностью без правок:

- `src/core/agent-loop.ts`, `src/core/state.ts` — Agent Loop и машина состояний;
- `src/completion/policy.ts`, `src/completion/intent.ts` — Completion Policy и Intent Contracts;
- `src/verification/{engine,delta,integrity}.ts` — Verification, WorkspaceDelta, UNKNOWN;
- `src/domain/*`, `src/tools/*`, `src/storage/*`, `src/permissions/*`, `src/git/*`, `src/context/*`, `src/planner/*`, `src/llm/*`;
- `src/composition.ts` — composition root;
- `src/api.ts` — контракт `NexusAPI`;
- `apps/cli/index.ts`, `apps/cli/terminal.ts` — поведение CLI;
- `bench/*`, `script/{check,boundaries,build,smoke}.ts`, все 66 существующих тестов.

Проверяемое утверждение: после v0.2 `bun run check` даёт те же 6 PASS, а число тестов только растёт.

---

## 3. Что добавляется

### 3.1. Структура новых модулей

Отклонение от предложенной структуры и его причина: каталог `packages/` **запрещён гейтом boundaries**, а дробление на `packages/ui` + `packages/api` + `packages/shared` для MVP создаёт файлы ради структуры. Поэтому общий слой один — `apps/shared/`.

```
NexusCLI/nexus/
├── apps/
│   ├── cli/                    # существует; report.ts становится рендерером RunReport
│   ├── shared/                 # ← НОВОЕ: чистая логика без I/O, общая для CLI/сервера/веба
│   │   ├── run-report.ts       #   NexusAPI + AgentSession -> RunReport (структура 5 секций)
│   │   ├── protocol.ts         #   wire-типы HTTP/SSE (единственный контракт для web)
│   │   ├── models.ts           #   пресеты провайдеров + режимы Fast/Balanced/Deep
│   │   └── projects.ts         #   реестр проектов + настройки (project memory)
│   ├── server/                 # ← НОВОЕ: API-сервер и мост к ядру
│   │   ├── runs.ts             #   менеджер прогонов: буфер событий, SSE fan-out, permission bridge
│   │   ├── http.ts             #   роутер (чистая функция от Deps -> fetch handler)
│   │   └── index.ts            #   точка входа: Bun.serve + реальный provider
│   └── web/                    # ← НОВОЕ: React + TypeScript + Vite (свой package.json)
│       ├── vite.config.ts, index.html, tsconfig.json
│       └── src/{main.tsx,App.tsx,api.ts,styles.css,components/*}
└── test/product.test.ts        # ← НОВОЕ: e2e-тесты продуктового слоя
```

`apps/web` исключается из корневого `tsconfig.json` (у него свой), т.к. корневой настроен на `types: ["bun"]`.

### 3.2. Схема компонентов

```
┌──────────────────────────── apps/web (React + Vite) ────────────────────────────┐
│  PROJECTS PANEL        CHAT PANEL              EXECUTION VIEW                   │
│  проекты, статус       цель + поток            PLAN CHANGES VERIFICATION        │
│  MODEL MANAGEMENT      STEER/QUEUE             EVIDENCE RESULT                  │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                    HTTP (JSON) + SSE│  типы из apps/shared/protocol.ts
┌───────────────────────────────────┴─────────────────────────────────────────────┐
│                        apps/server  (API Layer / Agent bridge)                  │
│   http.ts   роутер                                                              │
│   runs.ts   один прогон = одна сессия ядра: буфер событий + курсор + SSE         │
│             permission bridge: PermissionReply ⇄ HTTP-ответ пользователя         │
│   apps/shared: run-report.ts (RunReport), projects.ts (реестр), models.ts        │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │  ЕДИНСТВЕННАЯ точка интеграции
┌───────────────────────────────────┴─────────────────────────────────────────────┐
│               createNexus() -> NexusAPI      (src/composition.ts, БЕЗ ПРАВОК)   │
│   Agent Loop → Tools → Verification Engine → WorkspaceDelta → Completion Policy │
│   SQLite store: sessions, actions, evidence, events, turns, verification_runs    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3. Ключевые решения

**Р1. Сервер — второй клиент `NexusAPI`, а не новый мост.** `apps/server/http.ts` — чистая функция `createRouter(deps) -> (Request) => Response`, где `deps` содержит уже созданный `NexusAPI`. Следствие: тесты продуктового слоя внедряют `ScriptedProvider` тем же способом, что и 66 существующих тестов, без сети и без реальной модели.

**Р2. `RunReport` — единственный источник для EXECUTION VIEW.** Логика вывода переносится из `apps/cli/report.ts` в `apps/shared/run-report.ts` как чистая функция, возвращающая данные. CLI остаётся рендерером ANSI-текста над этой структурой. Требование: **текст CLI-отчёта не меняется ни на символ** — фиксируется golden-снимком до рефакторинга и сравнением после.

**Р3. Model Management без нового AI-движка.** Ядро поддерживает `provider: "openai-compatible"`. OpenAI, Anthropic (её OpenAI-совместимый endpoint), Ollama (`/v1`), LM Studio, llama.cpp, vLLM — всё это тот же протокол, отличаются только `baseUrl`, `apiKeyEnv` и имя модели. Поэтому Model Management = **пресеты + реальный probe `GET {baseUrl}/models` + маппинг режимов на бюджеты**. Никакого нового адаптера, никаких заглушек. Нативный Anthropic Messages API — честно вынесен за границу v0.2 (см. риск Р-4).

**Р4. Режимы — реальные бюджеты, а не подписи.** `Fast | Balanced | Deep Reasoning` транслируются в существующий `Budgets` (`maxTurns`, `maxTools`, `maxOutputTokens`, `maxDurationMs`) и передаются в `api.create({budgets})`. Режим влияет на поведение, иначе это фейковая функция.

**Р5. Project Memory — фундамент, не новая база.** История задач, изменения и evidence **уже** лежат в SQLite ядра и доступны через `api.sessions()` / `api.inspect()`. Новое хранилище нужно только для того, чего в ядре нет: список проектов и их настройки → один файл `projects.json` в `dataDir`. Сложная долгосрочная память не делается.

**Р6. Permission bridge обязателен.** `PermissionEngine` может потребовать подтверждения (`RUN_TESTS`, `RUN_PROCESS`). У CLI для этого stdin. Без веб-эквивалента прогон просто зависнет. Поэтому сервер публикует `permission_request` c `requestId` и ждёт `POST /api/runs/:id/permission`. Настройка проекта `allowChecks` даёт `rules: { RUN_TESTS: "allow" }` — то же, что флаг CLI `--allow-checks`.

**Р7. Стрим с курсором, а не «живой» WebSocket.** События буферизуются в памяти прогона и нумеруются. `GET /api/runs/:id/events?cursor=N` отдаёт SSE с реплеем от курсора. Перезагрузка страницы не теряет историю; WebSocket не нужен.

### 3.4. Контракт API

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/health` | версия, dataDir, доступность bun/git |
| GET | `/api/models` | пресеты, режимы, наличие ключа (только boolean) |
| POST | `/api/models/probe` | реальный `GET {baseUrl}/models` |
| GET/POST | `/api/projects` | список / регистрация проекта по пути |
| GET/PATCH/DELETE | `/api/projects/:id` | проект + detect() + история задач / настройки / удаление из реестра |
| POST | `/api/runs` | запуск задачи (`projectId`, `goal`, `mode`, `model`, `goalCommand`) |
| GET | `/api/runs` | список прогонов |
| GET | `/api/runs/:id` | статус |
| GET | `/api/runs/:id/events` | **SSE-стрим событий** (`?cursor=N`) |
| GET | `/api/runs/:id/report` | **структурированный `RunReport`** |
| GET | `/api/runs/:id/diff` | патчи |
| POST | `/api/runs/:id/prompt` | STEER / QUEUE |
| POST | `/api/runs/:id/permission` | ответ на запрос разрешения |
| POST | `/api/runs/:id/cancel` | AbortController |
| POST | `/api/runs/:id/assert-goal` | ручное подтверждение |
| POST | `/api/runs/:id/trust-checks` | доверие изменённому harness |
| POST | `/api/runs/:id/resolve-action` | разбор UNKNOWN |

Последние три — не «лишние фичи»: без них UNKNOWN-состояние в UI становится тупиком, из которого нельзя выйти.

### 3.5. UI

Тёмная тема, три колонки, без UI-фреймворка (react + react-dom + vite, обычный CSS). Приоритет — рабочий инструмент: моноширинные отчёты, читаемые вердикты, явное различие `COMPLETED` / `FAILED` / `UNKNOWN`.

---

## 4. План реализации

| Этап | Содержание | Проверка | Коммит |
|---|---|---|---|
| **E0** | Анализ + этот документ | — | `docs: Nexus v0.2 product layer plan` |
| **E1** | `apps/shared/run-report.ts`; `apps/cli/report.ts` → рендерер | golden-diff CLI-отчёта пуст; `bun run check` 6/6 | `refactor: extract structured RunReport` |
| **E2** | `apps/shared/{protocol,models,projects}.ts` | typecheck, boundaries | `feat: product-layer contracts` |
| **E3** | `apps/server/{runs,http,index}.ts` | `test/product.test.ts` e2e + `script/product-smoke.ts` | `feat: Nexus API server` |
| **E4** | `apps/web` (Vite/React/TS, 3 панели) | build веба, прогон в браузере | `feat: Nexus web interface` |
| **E5** | Финальный прогон гейта + документация | `bun run check` 7/7 + новые тесты | `chore: v0.2 release checks` |

Каждый этап: `git status` → тесты → typecheck → build → коммит. По завершении — ветка `nexus-v0.2` и push; при отсутствии прав — `git bundle` + patch-файлы.

---

## 5. Риски

| ID | Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|---|
| Р-1 | Рефакторинг `report.ts` меняет вывод CLI | средняя | высокое | golden-снимок до/после + 2 существующих теста Phase 5 |
| Р-2 | Каталог `packages/` ломает `boundaries` | высокая | среднее | не создаём `packages/`; общий слой `apps/shared` |
| Р-3 | `apps/web/*.ts` попадает в корневой typecheck и падает | высокая | среднее | `apps/web` в `exclude` корневого tsconfig, свой tsconfig у веба |
| Р-4 | Нативный Anthropic Messages API требует нового `Provider` и правки `ModelConfig` в domain | — | высокое | вне границ v0.2; Anthropic через OpenAI-совместимый endpoint; в UI указано честно |
| Р-5 | Прогон зависает на запросе разрешения | высокая | высокое | permission bridge (Р6) + видимый запрос в UI + таймаут прогона по `maxDurationMs` |
| Р-6 | Store занимает workspace lock (`acquire`) → второй прогон в том же проекте падает | средняя | среднее | один активный прогон на проект; UI блокирует повторный запуск |
| Р-7 | UI показывает успех, которого не авторизовала Completion Policy | низкая | критическое | UI читает только `session.status`/`session.decision`; тест на UNKNOWN через HTTP |
| Р-8 | Бесконечный рост буфера событий в памяти | низкая | среднее | буфер на прогон ограничен, события всё равно persist в SQLite |
| Р-9 | Секреты в UI | низкая | высокое | API отдаёт только `apiKeyConfigured: boolean`; события уже проходят `redact` |

---

## 6. Definition of Done (Nexus v0.2 MVP)

Каждый пункт считается выполненным только при наблюдаемом результате. Отметки ниже проставлены по факту реализации.

**Функциональные (требования первого релиза):**

- [x] **D1. Открыть проект.** `POST /api/projects` регистрирует путь; `GET /api/projects/:id` возвращает `kind` и `checks` из реального `detect()`.
      *Проверено:* «registering a directory reports the real detected project, not a guess»; «a missing directory is refused instead of registered».
- [x] **D2. Отправить задачу агенту.** `POST /api/runs` создаёт сессию через `api.create()` и запускает `api.run()`.
      *Проверено:* «a task streams events and ends with a report that proves the result»; `script/product-smoke.ts`.
- [x] **D3. Получить поток событий.** SSE отдаёт `created`, `state`, `tool` и терминальное `run_finished`; реплей по `cursor` работает; кадры без поля `event:`, поэтому один обработчик браузера видит все типы.
      *Проверено:* «replaying from a cursor returns only the events after it»; «frames carry no named event type…».
- [x] **D4. Показать план.** `RunReport.plan` соответствует `session.plan`.
- [x] **D5. Показать изменения.** `RunReport.changes.files` содержит путь, `+/-` и патч из `api.diff()`.
- [x] **D6. Показать проверки.** `RunReport.verification` содержит `checkId`, вердикт, argv, exit code и причину `UNKNOWN`.
- [x] **D7. Показать доказательство результата.** `RunReport.evidence` для каждого обязательного критерия показывает, доказан он и каким `evidenceId`; `RunReport.result` берёт статус из `session.decision`.
      *D4–D7 проверены* тем же MVP-тестом, продуктовым smoke и прогоном в браузере.

**Целостность (главный принцип):**

- [x] **D8.** Прогон с недоказуемой проверкой возвращает через HTTP `status: "UNKNOWN"` и `affordances`, содержащие `trust-checks` и `assert-goal`.
      *Проверено:* «an unprovable check is reported as UNKNOWN over HTTP, with a way out».
- [x] **D9.** Ни один ответ API не содержит вердикта, вычисленного вне `completionPolicy`. Ручное подтверждение сохраняется как user evidence и само по себе не переводит сессию в `COMPLETED`; повышение происходит только на следующем прогоне.
      *Проверено:* «a manual assertion is recorded as user evidence, not as a passing check»; «assert-goal then resume lets the completion policy promote the session».

**Регрессии и качество:**

- [x] **D10.** `bun run check` — 7/7 PASS (добавлен шаг `product`: API-сервер end-to-end через реальные HTTP и SSE).
- [x] **D11.** Все 66 существующих тестов проходят; добавлено 15 тестов продуктового слоя, итого 81.
- [x] **D12.** Текст CLI-отчёта побайтово совпадает со снимком до рефакторинга для прогонов `COMPLETED`, `UNKNOWN` и `FAILED` (2824 байта, пустой diff против `0411d7a`).
- [x] **D13.** `apps/web` собирается: `tsc --noEmit` и `vite build` без ошибок.
- [x] **D14.** Ни одного изменения в `src/core/`, `src/completion/`, `src/verification/`, `src/domain/`.

**Отклонения от исходного задания и их причины:**

1. Вместо `packages/{ui,api,shared}` — один общий слой `apps/shared`. Причина: `script/boundaries.ts` считает любой импорт, содержащий `packages/`, нарушением архитектуры; дробление на три пакета для MVP создавало бы файлы ради структуры.
2. Проекты не захардкожены списком (`Axiom`, `PITY_NULL`), а регистрируются пользователем по пути: захардкоженный список был бы фейковой функцией. Тип проекта и проверки берутся из реального `detect()`.
3. Anthropic подключён через её OpenAI-совместимый endpoint. Нативный Messages API потребовал бы нового `Provider` и правки `ModelConfig` в `src/domain` — это запрещено границами задачи.
4. Добавлены не заявленные, но необходимые для работоспособности вещи: permission bridge (иначе прогон с проверками зависает), `resume` и адаптация сессий из журнала (иначе `UNKNOWN` и история задач — тупик).
5. `script/check.ts` и корневой `tsconfig.json` изменены минимально: сканирование границ игнорирует `node_modules` внутри приложений, а браузерное приложение исключено из корневого typecheck (у него свой).

**Вне границ v0.2 (осознанно не сделано):** нативный Anthropic Messages API, долгосрочная память проекта, мультиагентность, Electron-упаковка, аутентификация сервера, редактор кода в UI, параллельные прогоны в одном workspace.
