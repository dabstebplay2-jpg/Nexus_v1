# Nexus Launcher — Website Direct Download

Сделано:
- обновлён `website/index.html`;
- главная кнопка теперь ведёт напрямую на GitHub Release asset:
  `releases/latest/download/NexusLauncherSetup-0.7.2-win-x64.exe`;
- добавлена отдельная кнопка portable ZIP:
  `releases/latest/download/NexusLauncher-0.7.2-win-x64-portable.zip`;
- пользователь скачивает файл одной кнопкой без открытия страницы GitHub;
- `website/app.js` теперь:
  - проверяет latest release API;
  - предпочитает `Setup*.exe`;
  - если setup не найден, выбирает installer/exe/portable zip;
  - обновляет версию и имя asset на сайте;
  - копирует прямую ссылку скачивания;
- обновлён `website/release.json`;
- обновлён `website/downloads/release.json`;
- добавлены стили для блока имени файла;
- обновлён `website/README.txt`.

Важно:
- кнопка `latest/download/NexusLauncherSetup-0.7.2-win-x64.exe` начнёт работать только после публикации GitHub Release `v0.7.2`, где asset имеет точно такое имя.
- если latest release API доступен и в релизе есть другой подходящий `.exe`, сайт сам подставит его.
