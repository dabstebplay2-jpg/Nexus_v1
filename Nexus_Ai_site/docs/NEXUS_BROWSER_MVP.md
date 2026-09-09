# Nexus Browser MVP

## Запуск разработки

```powershell
cd nexus-browser
npm ci
npm run dev
```

Требуется Node 20+. Electron откроет окно с UI chrome и вкладкой `example.com`.

## Вход

1. В боковой панели нажмите **Войти**
2. В окне приложения — Google OAuth (системный браузер не нужен)

## Скачать (Windows)

Соберите `npm run dist` или скачайте артефакты CI **NexusBrowser-Windows** (Portable + Setup).

## Фичи MVP

- Мульти-вкладки (BrowserView)
- Omnibox: URL или search-first ( `/ai/browser/search` )
- AI sidebar: page-aware stream (`/ai/browser/context-chat/stream`)
- Agent mode: локальные tools + `/ai/browser/agent/stream`
- История и закладки (локальный JSON)
- Google auth через общий аккаунт Nexus

## Сборка portable

```powershell
cd nexus-browser
.\scripts\build.ps1
.\scripts\package-release.ps1
```

Артефакты: `NexusBrowser-*-Portable.exe`, `NexusBrowser-*-Setup.exe` в `nexus-browser/dist/`

## API endpoints (cloud)

| Endpoint | Назначение |
|----------|------------|
| `POST /v1/ai/browser/search` | Omnibox search-first |
| `POST /v1/ai/browser/context-chat/stream` | Page-aware чат |
| `POST /v1/ai/browser/agent/stream` | Agent orchestration |

Поле `page_context` также поддерживается в `SimpleChatRequest`.
