# Nexus Launcher — Verified Auto Update 0.7.7

Что обновлено:
- версия поднята до 0.7.7;
- сайт проверен: GitHub Pages работает и показывает 0.7.6;
- логика автообновления усилена:
  - GitHub Releases остаётся главным источником;
  - сайт release.json используется как fallback;
  - скачанный Setup EXE теперь проверяется по SHA256 asset из GitHub Release;
  - если SHA256 не совпал, установщик не запускается;
  - update-helper запускает Setup EXE после закрытия Nexus;
  - установка запускается тихо через Inno Setup flags: /SILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS;
  - в настройках добавлена кнопка открытия сайта;
- обновлены website/release.json и кнопки сайта под 0.7.7.

Проверка:
- Python syntax: OK;
- workflow YAML: OK;
- website JSON: OK.
