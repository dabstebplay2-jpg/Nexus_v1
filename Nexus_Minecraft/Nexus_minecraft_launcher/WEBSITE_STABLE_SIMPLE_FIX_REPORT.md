# Nexus Launcher Website — Stable Simple Fix

Причина:
- прошлый сайт был визуально перегружен;
- floating-карточки и крупные hero-блоки ломали восприятие;
- секции выглядели разорванными;
- часть элементов выглядела так, будто налезает на другие блоки.

Сделано:
- полностью переписаны `website/index.html`, `website/styles.css`, `website/app.js`;
- убраны тяжёлые canvas/preloader/spotlight/floating overlays;
- сделана простая стабильная структура;
- сохранён Minecraft/Nexus стиль;
- кнопки скачивания оставлены прямыми;
- адаптация сделана через обычные CSS grid/media queries;
- обновлены `release.json`, `manifest.webmanifest`, `README.txt`;
- версия сайта: 0.7.3.

Проверка:
- сайт статический;
- npm не нужен;
- запускается через `python -m http.server`.
