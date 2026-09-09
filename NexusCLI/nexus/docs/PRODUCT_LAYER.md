# Продуктовый слой (v0.2)

Назначение: превратить ядро в пользовательский продукт, не меняя Agent Loop, Verification Engine и Completion Policy.

## Границы

```text
apps/web            React + TypeScript + Vite; рендерит события и отчёт
   |  HTTP + SSE
apps/server         API-сервер: роутер, agent bridge, permission bridge
   |  createNexus() -> NexusAPI          ← единственная точка интеграции
src/                Agent Loop, tools, verification, completion policy, SQLite
```

Правило, которое слой обязан сохранять: **завершение авторизует только `completionPolicy`.** Сервер и интерфейс не вычисляют вердикт — они читают `session.status` и `session.decision`. Поэтому `apps/server` не является новым мостом в ядро: это второй клиент той же границы, что и `apps/cli`.

## Модули

| Модуль                      | Ответственность                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/shared/protocol.ts`   | Wire-контракт. Только типы, без runtime — веб-интерфейс импортирует его напрямую.                                          |
| `apps/shared/run-report.ts` | Чистая функция `buildRunReport(api, id, session)`: пять секций отчёта как данные.                                          |
| `apps/shared/models.ts`     | Пресеты провайдеров и режимы. Режим транслируется в реальный `Budgets`.                                                    |
| `apps/shared/projects.ts`   | Реестр проектов и их настройки (`projects.json`).                                                                          |
| `apps/server/runs.ts`       | Один прогон = одна сессия ядра: буфер событий с курсорами, permission bridge, отмена, resume, адаптация сессий из журнала. |
| `apps/server/http.ts`       | Роуты, SSE, CORS только для loopback, реальный probe `GET {baseUrl}/models`.                                               |
| `apps/server/index.ts`      | `createNexusServer()` возвращает fetch-обработчик; `Bun.serve` слушает 127.0.0.1.                                          |
| `apps/cli/report.ts`        | Терминальный рендерер того же `RunReport`.                                                                                 |

## Отчёт как единственный источник

`RunReport` содержит `plan`, `changes`, `verification`, `evidence`, `result`, `affordances` и `proposal`. Ключевые свойства:

- каждый обязательный критерий контракта указывает, доказан он и каким `evidenceId`;
- `proposal.verified` равно `true` только при `status === "COMPLETED"`; иначе текст модели помечен как непроверенное предложение;
- `affordances` перечисляет применимые действия (`inspect`, `trust-checks`, `assert-goal`, `resolve-action`, `resume`), поэтому `UNKNOWN` не может стать тупиком в интерфейсе.

Вывод CLI после выделения структуры совпадает побайтово с прежним для прогонов `COMPLETED`, `UNKNOWN` и `FAILED`.

## API

| Метод              | Путь                                                            | Назначение                                                           |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| GET                | `/api/health`                                                   | версия, dataDir, найденные исполняемые файлы                         |
| GET                | `/api/models`                                                   | пресеты и режимы; про ключи — только `keyConfigured`                 |
| POST               | `/api/models/probe`                                             | реальный список моделей с выбранного endpoint                        |
| GET, POST          | `/api/projects`                                                 | список, регистрация каталога                                         |
| GET, PATCH, DELETE | `/api/projects/:id`                                             | детали с `detect()` и историей задач, настройки, удаление из реестра |
| GET, POST          | `/api/runs`                                                     | список прогонов, запуск задачи                                       |
| GET                | `/api/runs/:id`                                                 | статус и текущий запрос разрешения                                   |
| GET                | `/api/runs/:id/events`                                          | SSE; `?cursor=N` — реплей без пропусков                              |
| GET                | `/api/runs/:id/report`                                          | `RunReport`                                                          |
| GET                | `/api/runs/:id/diff`                                            | патчи и неатрибутируемые процессы                                    |
| POST               | `/api/runs/:id/prompt`                                          | `STEER` или `QUEUE`                                                  |
| POST               | `/api/runs/:id/permission`                                      | ответ на запрос разрешения                                           |
| POST               | `/api/runs/:id/cancel`, `/resume`                               | отмена и повторный прогон той же сессии                              |
| POST               | `/api/runs/:id/assert-goal`, `/trust-checks`, `/resolve-action` | выход из `UNKNOWN` и `NEEDS_USER_INPUT`                              |

Событие `run_finished` — единственное, которое добавляет сервер: у ядра нет понятия «прогон закончился», а клиенту нужно отличать завершение от тишины. Кадры SSE не содержат поля `event:`, поэтому один обработчик браузера видит все типы, включая будущие.

## Управление моделями

Ядро поддерживает `provider: "openai-compatible"`. OpenAI, совместимый endpoint Anthropic, Ollama, LM Studio, llama.cpp и vLLM говорят на том же протоколе, поэтому поддержка сводится к базовому URL, имени модели и переменной окружения с ключом. Нативный Anthropic Messages API потребовал бы отдельного адаптера `Provider` и изменения `ModelConfig` в domain — это вне границ v0.2 и в интерфейсе указано прямо.

## Память проекта

История задач, изменения, проверки и evidence уже хранятся в журнале ядра и читаются через `NexusAPI`. Второе хранилище для них могло бы только разойтись с журналом, поэтому `projects.json` содержит лишь то, чего ядро не знает: какие каталоги пользователь считает проектами и как их запускать. Сессия, начатая в другом процессе, подхватывается по требованию: её события реплеятся из журнала, отчёт доступен, прогон можно продолжить.

## Ограничения v0.2

Нативный Anthropic Messages API; долгосрочная память проекта; несколько параллельных прогонов в одном workspace (ядро держит lock на workspace); аутентификация сервера (только loopback); редактор кода в интерфейсе; упаковка в desktop-приложение.
