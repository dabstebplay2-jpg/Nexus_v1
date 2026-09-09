# Nexus Browser — Windows-приложение

Отдельное **десктопное** приложение (Electron + Chromium). Не сайт и не вкладка в браузере — скачал `.exe`, запустил.

## Скачать и запустить

### Вариант A — portable (без установки)

1. Скачайте `NexusBrowser-*-Portable.exe` из [GitHub Releases — Nexus_browser](https://github.com/dabstebplay2-jpg/Nexus_browser/releases)  
   или на сайте Nexus: [/browser](https://nexus-ai.ru/browser) (прямая кнопка).
   или возьмите готовую сборку из `dist-build/` / `dist/` после локальной сборки (см. ниже).
2. Запустите файл двойным щелчком.
3. В боковой панели нажмите **Войти** — откроется окно входа **внутри приложения** (Google).

### Вариант B — установщик

1. Скачайте `NexusBrowser-*-Setup.exe` (или из `dist-build/`).
2. Установите, запустите **Nexus Browser** из меню Пуск.

После входа аккаунт Nexus общий с сайтом и IDE — отдельная регистрация не нужна.

## Сборка на своём ПК

```powershell
cd nexus-browser
npm ci
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run dist
```

Готовые файлы в `dist/` и зеркало в `dist-build/`:

| Файл | Назначение |
|------|------------|
| `NexusBrowser-<version>-Portable.exe` | portable, можно с флешки |
| `NexusBrowser-<version>-Setup.exe` | установщик Windows |
| `win-unpacked/Nexus Browser.exe` | распакованная версия для отладки |

Текущая версия — в `package.json` (сейчас **0.4.1**). Версия сайта (0.1.x) — отдельно.

Логотип браузера — тот же, что на сайте Nexus (`frontend/public/brand/image/`). Обновить копию в браузере: `.\scripts\sync-brand.ps1`

**Иконка на рабочем столе:** для корректного логотипа Nexus на ярлыке используйте **`NexusBrowser-*-Setup.exe`** (установщик). Portable-файл может показывать стандартную иконку Electron на самом `.exe`, но в панели задач при работе будет логотип Nexus.

Или одной командой: `.\scripts\package-release.ps1`

## Разработка (только для разработчиков)

```powershell
npm run dev
```

Откроется окно Electron с hot-reload UI. DevTools **не** открываются автоматически (меньше нагрузка на CPU/RAM). При необходимости: `$env:NEXUS_BROWSER_DEVTOOLS='1'; npm run dev`.

Для обычных пользователей нужен только `npm run dist` или скачивание релиза.

## Возможности

- Мульти-вкладки, omnibox (URL + поиск)
- AI sidebar с контекстом страницы
- Agent mode (навигация, клики, ввод)
- Закладки и история (локально на ПК)

Документация: [docs/NEXUS_BROWSER_ARCH.md](../docs/NEXUS_BROWSER_ARCH.md)
