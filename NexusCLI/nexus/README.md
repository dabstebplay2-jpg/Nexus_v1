# NexusCLI

Локальный coding agent, у которого **«готово» — решение Core на основании evidence, а не фраза модели**.

Версия 0.1 — работающий фундамент: CLI, SQLite, OpenAI-compatible Chat Completions, tools, durable inbox, проверки, recovery, контекст и детерминированные сценарии. Исходный OpenCode в родительской папке используется только как reference и не является зависимостью Nexus.

## Быстрый старт на Windows

Из этой папки:

```powershell
npm ci
.\nexus.cmd config init
.\nexus.cmd doctor
```

Локальный Bun входит в devDependencies, глобальная установка для этих команд не нужна. Настройки сохраняются в `%USERPROFILE%\.nexuscli\config.json`; ключ хранится **в переменной окружения**, а не в конфиге или SQLite.

Укажите точное имя модели вашего OpenAI-compatible сервера:

```powershell
$env:NEXUS_BASE_URL = 'http://localhost:1234/v1'
$env:NEXUS_MODEL = 'имя-модели-на-сервере'
# Для сервера с авторизацией:
$env:NEXUS_API_KEY = 'ваш-ключ'
.\nexus.cmd run 'Найди причину падения тестов, исправь ее и проверь результат.' --workspace 'C:\projects\my-app'
```

Сетевые провайдеры требуют HTTPS; HTTP разрешён для loopback. По умолчанию используется `http://localhost:1234/v1` и имя-заглушка `local-model`: работающий сервер и реальная модель должны быть настроены пользователем. Поддерживается Chat Completions, не Responses API. Модели для coding должны поддерживать tool calling.

Без аргумента задачи открывается простой интерактивный prompt:

```powershell
.\nexus.cmd --workspace 'C:\projects\my-app'
```

В другом терминале, или во время работы через интерактивный ввод, можно сохранять новые указания. Обычный текст и `/steer ...` применяются на ближайшей безопасной границе. `/queue ...` ожидает завершения текущей задачи. Ctrl+C прерывает работу с сохранением состояния.

## Отдельный исполняемый файл

```powershell
.\node_modules\.bin\bun.cmd run build
.\dist\nexus.exe --help
```

Добавьте папку `dist` в PATH — после этого в любом проекте доступна команда `nexus`. Файл содержит runtime; компиляторы, package managers и тестовые зависимости целевого проекта устанавливаются отдельно. Для Linux/macOS: установите [Bun](https://bun.sh/docs/installation), выполните `bun install`, `bun run build`; результат — `dist/nexus`.

## Что считается завершением

Для точных задач `Fix failing tests` и «Найди причину падения тестов, исправь ее и проверь результат» автоматически создаётся контракт: исходное падение воспроизведено до изменений, та же проверка проходит после изменений, остальные обнаруженные проверки проходят. При смешанных или произвольных требованиях тесты сами по себе не доказывают весь пользовательский сценарий.

Для произвольной задачи задайте проверяемый сценарий явно:

```powershell
.\nexus.cmd run 'Исправь сохранение настроек' --workspace 'C:\projects\my-app' --goal-command '["node","test-settings.mjs"]'
```

`--goal-command` — JSON-массив argv, без shell-интерполяции. Проверка должна выходить с кодом 0 только при выполнении исходного требования. Команда и существующие файлы проверок фиксируются при создании сессии. Модель не может заменить контракт через tool.

Если автоматической проверки цели нет, Core возвращает `NEEDS_USER_INPUT`, а CLI не печатает DONE. После личной проверки сценария:

```powershell
.\nexus.cmd assert-goal SESSION_ID 'Изменил настройку, перезапустил приложение, значение сохранилось'
.\nexus.cmd resume SESSION_ID
```

Для информационных вопросов существует `--answer`: проверяется доставка непустого ответа, **не истинность ответа и не успешность coding-задачи**. Tools в этом режиме не доступны.

## Разрешения

Чтение обычных файлов и запись внутри проекта разрешены по умолчанию. Запуск проверок, shell, установка пакетов и Git-мутации требуют подтверждения. `--allow-checks` заранее разрешает выполнение обнаруженных project checks; используйте для доверенного проекта. В non-interactive режиме действие с политикой ask сохраняется как `WAITING_PERMISSION`.

Shell и project scripts работают с правами пользователя ОС: это **не sandbox**. Файловые tools блокируют выход из workspace, symlinks/junctions, стандартные secret paths, служебные каталоги и Windows device/ADS paths. Произвольный одобренный shell может обходить эти ограничения; не запускайте агент с недоверенным проектом вне изоляции ОС.

## Команды

| Команда                                                  | Назначение                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `nexus`, `nexus run "goal"`                              | Создать и выполнить задачу                                                          |
| `nexus resume [id]`                                      | Явно продолжить сессию; без id — последнюю                                          |
| `nexus sessions`                                         | Показать сохранённые задачи                                                         |
| `nexus config [init]`, `nexus doctor`                    | Конфигурация и диагностика runtime/PATH                                             |
| `nexus steer id "text"`, `nexus queue id "text"`         | Durable admission из другого процесса                                               |
| `nexus inspect-session id`, `nexus debug [id]`           | Ledger, evidence, turns, epochs, inbox, решения                                     |
| `nexus diff id`                                          | Последовательность точных agent edits относительно содержимого перед каждой записью |
| `nexus assert-goal id "note"`                            | Подтвердить лично проверенный сценарий                                              |
| `nexus resolve-action id action VERIFIED\|FAILED "note"` | Зафиксировать результат инспекции UNKNOWN                                           |
| `nexus trust-checks id "review note"`                    | Доверить проверенные пользователем изменения существующего test harness             |

`--data-dir` задаёт другое хранилище; `--debug` включает структурированные события. Все процессы, работающие с одним workspace, должны использовать одно хранилище. Exit codes: 0 — завершено или служебная команда успешна; 2 — задача не завершена; 1 — ошибка CLI/конфигурации.

## Проверки проекта Nexus

Запускать из `nexus/`, не из корня OpenCode:

```powershell
.\node_modules\.bin\bun.cmd typecheck
.\node_modules\.bin\bun.cmd test
.\node_modules\.bin\bun.cmd run check:boundaries
.\node_modules\.bin\bun.cmd run bench
.\node_modules\.bin\bun.cmd run build
```

На системе с Bun в PATH используйте `bun typecheck`, `bun test`, `bun run bench`, `bun run build`. Основные тесты используют scripted provider, настоящую SQLite, файловую систему, HTTP/SSE-серверы и subprocess. Платные API для тестов не нужны. NexusBench содержит два успешных исправления и отрицательный сценарий ложного завершения; независимый oracle запускается вне workspace агента. Это проверка надёжности механизма, не оценка интеллекта настоящей модели.

## Структура и документы

```text
apps/cli/                  terminal adapter
src/api.ts                 public UI boundary
src/composition.ts         единственный composition root
src/domain/                сущности и порты
src/core/                  state machine, agent loop
src/session/               durable inbox
src/planner/               план и валидация зависимостей
src/context/               sources, epochs, compaction
src/completion/            контракт и решение о завершении
src/verification/          запуск проверок, защита harness
src/recovery/              инспекция после сбоя
src/loop-guard/            бюджеты и обнаружение циклов
src/tools/                 registry, executor, builtins, process, guard
src/permissions/           capability policy
src/storage/               SQLite, migrations, ledger/evidence projections
src/project/               adapters, retrieval
src/llm/                   OpenAI-compatible provider
src/git/                   baseline, agent diff
src/config/, src/shared/   конфигурация, ошибки, redaction
test/, bench/, docs/
```

Подробности: [архитектура](docs/ARCHITECTURE.md), [цикл](docs/AGENT_LOOP.md), [верификация](docs/VERIFICATION.md), [recovery](docs/RECOVERY.md), [tools](docs/TOOLS.md), [публичный API](docs/API.md), [roadmap и ограничения](docs/ROADMAP.md).
