# Nexus Website → React/Vite migration plan

Сайт сейчас доведён как production-ready static website, чтобы GitHub Pages продолжал работать без сборки.

## Почему не переносим сразу
- Статический сайт уже быстро деплоится через GitHub Pages.
- Нет риска сломать текущую страницу скачивания.
- Дизайн, структура и тексты сначала стабилизируются.

## Как переносить на React
1. Создать `website-next`.
2. Перенести секции из `website/index.html` в компоненты:
   - `Header`
   - `Hero`
   - `Stats`
   - `Features`
   - `CatalogPreview`
   - `ReleaseStatus`
   - `DownloadCards`
   - `Roadmap`
   - `FAQ`
   - `Footer`
3. Перенести CSS-переменные и layout в `src/styles/global.css`.
4. Сделать GitHub Release hook:
   - `src/hooks/useLatestRelease.ts`
5. После проверки заменить Pages workflow на сборку React:
   - `npm ci`
   - `npm run build`
   - upload `website-next/dist`

## Важно
Текущая папка `website/` остаётся основной для GitHub Pages, пока React-версия не будет готова.
