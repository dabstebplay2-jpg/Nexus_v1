# Nexus Launcher — Website Premium Redesign

Сделано:
- полностью переписан `website/index.html`;
- полностью переписан `website/styles.css`;
- полностью переписан `website/app.js`;
- добавлены SVG-иконки:
  - `logo.svg`
  - `download.svg`
  - `desktop.svg`
  - `shield.svg`
  - `cube.svg`
  - `mods.svg`
  - `speed.svg`
  - `update.svg`
  - `java.svg`
  - `arrow.svg`
- обновлены:
  - `favicon.svg`
  - `og-cover.svg`
  - `manifest.webmanifest`
  - `release.json`
  - `downloads/release.json`
  - `README.txt`

Что улучшено:
- премиальный hero-блок;
- glassmorphism и glowing cards;
- animated canvas background;
- mouse spotlight;
- 3D tilt макет приложения;
- floating cards;
- scroll reveal-анимации;
- magnetic hover-кнопки;
- адаптивное мобильное меню;
- улучшенный download-блок;
- прямая загрузка Setup EXE без перехода на GitHub;
- кнопка portable ZIP;
- динамическая загрузка latest release через GitHub API;
- автообновление версии и asset name;
- блоки feature cards, Smart Builder, Roadmap, FAQ;
- обновлён SEO/OG preview.

Проверка:
- сайт статический, запускается через `python -m http.server`;
- внешние npm/bundler зависимости не нужны.
