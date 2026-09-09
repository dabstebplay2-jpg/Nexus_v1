# Web IDE (`/ide/lite`)

**Статус: активная доработка UX + browser demo.**

## Назначение

- **IDE Web** в боковом меню сайта — быстрый доступ к редактору в браузере
- На **Vercel** (прод): демо-проект в IndexedDB, облачный Agent, mock-терминал
- Локально с `backend` на `:8000`: полный доступ к файлам, git, реальному терминалу

## Точки входа

| Место | Путь |
|-------|------|
| Боковое меню | **IDE Web** → `/ide/lite` |
| Хаб IDE | `/ide` — карточки «Открыть IDE Web» и «Скачать Desktop» |
| Чат | кнопка **IDE Web** в шапке |
| Главная | карточка в блоке возможностей |

## Демо-режим (Vercel)

- Виртуальная ФС: `README.md`, `package.json`, `src/app.js` (IndexedDB)
- Agent: облачный inference + инструменты на клиенте (`read_file`, `patch_file`, …)
- Терминал: `ls`, `cat`, `npm test`, `help` (заготовленный вывод)
- Git / LSP / OpenVSX — недоступны

Баннер на странице IDE предлагает [скачать Desktop](/ide) для работы с реальным репозиторием.

## Основной продукт

**[Nexus IDE Desktop](../nexus-desktop/README.md)** — VSCodium + OpenVSX + Nexus AI.

## Не в scope Web IDE

- Extension Host / VSIX / OpenVSX в браузере
- Полноценный debugger, LSP, multi-root parity
- Паритет с Cursor Desktop

## Будущее

При необходимости полноценной IDE в браузере — отдельный эпик: **OpenVSCode Server** или **code-server**, не развитие монолита `IdeApp.jsx`.
