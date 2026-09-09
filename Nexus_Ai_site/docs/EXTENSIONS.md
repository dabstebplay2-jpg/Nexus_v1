# Расширения Nexus IDE

## Маркетплейс: OpenVSX

Nexus IDE Desktop использует **[Open VSX Registry](https://open-vsx.org)** — открытую альтернативу Microsoft Marketplace.

- Установка: **Ctrl+Shift+X** → поиск → Install
- VSIX вручную: **Extensions: Install from VSIX…**

Microsoft Visual Studio Marketplace в Nexus IDE **не подключён** (условия использования Microsoft).

## Что обычно работает

| Категория | Примеры (OpenVSX) |
|-----------|-------------------|
| Форматирование | Prettier, ESLint |
| Языки | Python (ms-python), Pylance*, Rust Analyzer, Go |
| Git | GitLens |
| Темы | One Dark Pro, Dracula |
| Remote | Open Remote SSH, Dev Containers (частично) |
| REST | REST Client, Thunder Client |

\* Проверяйте наличие конкретной версии на open-vsx.org.

## Ограничения

- Не все расширения из документации Microsoft есть в OpenVSX.
- Расширения с **проприетарными** зависимостями Microsoft (часть C# Dev Kit, Live Share от MS) могут не работать.
- В **веб-версии** (`/ide/lite`) VSIX **не поддерживаются** — только десктоп.

## Встроенные расширения Nexus

| ID | Назначение |
|----|------------|
| `nexus.nexus-auth` | Вход, токены, `nexus.cloudUrl` |
| `nexus.nexus-billing` | Тариф, пул ИИ, Account |
| `nexus.nexus-ai` | AI Chat (облако RouterAI): стриминг, вложения, контекст редактора, веб-поиск (🌐), режим мышления, источники, агенты |
| `nexus.nexus-welcome` | Walkthrough, настройки по умолчанию |

Исходники: [nexus-desktop/extensions/](../nexus-desktop/extensions/).

### Установка и отладка расширений

1. Синхронизация бренда (опционально, если есть `frontend/public/brand/image/`):  
   `nexus-desktop/scripts/sync-brand-assets.ps1`
2. Сборка VSIX: `nexus-desktop/scripts/package-extensions.ps1` → `nexus-desktop/dist/*.vsix`
3. Встроить в сборку IDE: `nexus-desktop/scripts/sync-extensions.ps1` → `vscodium/builtin-extensions/`
4. F5: открыть `nexus-desktop/extensions/.vscode/launch.json`, запустить **Extension Development Host**
5. Проверка версии: **Extensions** → **Nexus AI** — должна быть **1.7.0+** (без debug-баннера в чате). Команда **Nexus: Show AI Extension Info** показывает версию из `package.json`.

### AI Chat (`nexus.nexus-ai`) — десктоп vs сайт

| Возможность | Десктоп (расширение) | Сайт (nexus-frontend) |
|-------------|----------------------|-------------------------|
| Стриминг, модели по тарифу, вложения, контекст файла | да | да |
| Веб-поиск + глубина (quick / standard / deep) | да | да |
| Режим мышления (`enable_thinking` / reasoning API) | да | да |
| Источники в ответе + память для следующего запроса | да | да |
| Агенты (`agent_id`) | да | да |
| Spaces, облачная история всех диалогов | нет | да |
| Research (`/ai/research`), генерация картинок, артефакты | нет | да / частично |
| Markdown-рендер ответов | lightweight markdown + блоки кода с «Копировать»/«Применить» | полный markdown |
| Очистка чата / повтор ответа | да (панель и команда) | да |
| Режим агента (IDE tools: файлы, терминал, поиск) | да (`⚡ Агент` в header) | частично (сайт без полного IDE loop) |

Логика запроса синхронизирована с `frontend/src/lib/chatApi.js` и `modelSelection.js` (модули в `nexus-ai/lib/`).

### Режим агента (desktop)

Включите **«⚡ Агент»** в header чата. Extension выполняет цикл tool-calling локально: `list_dir`, `read_file`, `write_file`, `delete_path` (с подтверждением), `search_workspace`, `run_terminal` (опасные команды — confirm), `get_diagnostics`. Бренд-логотип: `nexus-ai/media/brand/` (скрипт `sync-brand-assets.ps1` копирует из `frontend/public/brand/image/`).

| Настройка | Описание |
|-----------|----------|
| `nexus.ai.confirmWrites` | Перед `write_file` показать diff и запросить подтверждение (по умолчанию `false`) |

Риски: `run_terminal` выполняет команды в корне workspace — используйте только в доверенных проектах. На приветствия и короткий small talk агент отвечает без инструментов.

## Рекомендуемый набор после установки

1. **ESLint** + **Prettier** — JS/TS
2. **Python** + **Pylance** (если есть на OpenVSX) — Python
3. **GitLens** — Git
4. **Error Lens** — подсветка ошибок
5. **REST Client** или **Thunder Client** — HTTP

## Публикация своих расширений

1. Соберите VSIX: `vsce package` в папке расширения.
2. Опубликуйте на [open-vsx.org](https://open-vsx.org) под namespace `nexus`.
3. Либо встройте в сборку: `nexus-desktop/extensions/` + `prepare.ps1`.

## Веб IDE Lite

Маршрут `/ide/lite` — упрощённый редактор в браузере без Extension Host (**режим заморозки**, см. [WEB_IDE_LITE.md](./WEB_IDE_LITE.md)). Полный функционал и OpenVSX — только в **Nexus IDE Desktop**.
