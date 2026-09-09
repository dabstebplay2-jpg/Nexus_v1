# Nexus Website v0.8 Polish

Сайт доведён ближе к уровню лаунчера.

Что сделано:
- полностью обновлён `website/index.html`;
- переписаны `website/styles.css` и `website/script.js`;
- `style.css` и `app.js` оставлены как совместимые дубликаты;
- добавлены секции:
  - Hero с превью лаунчера;
  - Возможности;
  - Каталог модов/модпаков/шейдеров/ресурспаков;
  - Интерфейс;
  - Updater status;
  - Скачать;
  - Roadmap;
  - FAQ;
- сайт динамически берёт latest release из GitHub API;
- обновлены `404.html`, `privacy.html`, `manifest.webmanifest`, `release.json`;
- добавлен `website/REACT_MIGRATION_PLAN_RU.md`;
- добавлен будущий scaffold `website-next/` для переезда на React/Vite;
- текущий GitHub Pages workflow не ломается, потому что основная папка сайта по-прежнему `website/`.

Важно:
- лаунчер не трогался;
- это обновление только сайта и подготовки будущей React-версии.
