# Nexus Website Hero Emblem Fix

Исправлена правая hero-секция сайта.

Проблема:
- предыдущая CSS-иконка выглядела плоско и грязно;
- существующий логотип слишком сильно перспективно сжимался и смотрелся как “умершая” иконка.

Что сделано:
- убран старый CSS-only 3D-блок;
- добавлен аккуратный SVG-арт `website/assets/hero-nexus-emblem.svg`;
- сайт теперь показывает нормальную крупную 3D-like эмблему Nexus;
- используется векторный SVG, не generated PNG;
- изменены только файлы сайта.

Файлы:
- website/index.html
- website/styles.css
- website/style.css
- website/assets/hero-nexus-emblem.svg
