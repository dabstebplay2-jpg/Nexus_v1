# Nexus Launcher — Website Stable Reset

Проблема:
- предыдущий сайт стал слишком перегруженным;
- блоки визуально наезжали друг на друга;
- sticky header и крупные секции создавали ощущение поломанной страницы;
- GitHub API мог подставлять старую версию/старый asset.

Что сделано:
- сайт переписан в простой стабильный landing;
- убраны canvas/stars/floating cards/3D tilt;
- убрана сложная динамическая логика GitHub API;
- оставлена статическая прямая загрузка через GitHub Releases latest/download;
- layout сделан обычным потоком без абсолютных пересечений;
- адаптивность через простые media queries;
- версия: 0.7.3.

Изменённые файлы:
- website/index.html
- website/styles.css
- website/app.js
- website/release.json
- website/downloads/release.json
- website/README.txt
- website/assets/logo.svg
- website/assets/favicon.svg
- website/assets/og-cover.svg
