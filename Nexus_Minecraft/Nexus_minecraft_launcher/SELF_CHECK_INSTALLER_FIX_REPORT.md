# Nexus Launcher — Self Check Installer Fix 0.7.9

Проблема:
- установленный EXE падал с ошибкой `ModuleNotFoundError: No module named 'storage'`;
- сайт мог показать будущую версию из `release.json`, пока GitHub Release с таким asset ещё не готов.

Исправлено:
- версия поднята до 0.7.9;
- PyInstaller spec теперь включает локальные пакеты двумя способами:
  1. hiddenimports;
  2. datas + runtime hook `build/pyi_runtime_hook.py`;
- добавлен `--open-updates` режим запуска;
- в папку установленного приложения добавляются helper-файлы:
  - `Nexus Check Updates.cmd`;
  - `Nexus Diagnostics.cmd`;
  - `Nexus Repair Cache.cmd`;
  - `Open Nexus Website.cmd`;
- Start Menu получает пункты:
  - Проверить обновления;
  - Диагностика;
  - Очистить кэш обновлений;
  - Сайт;
- сайт теперь сначала спрашивает GitHub Releases API и только потом использует `release.json` как fallback;
- статический HTML больше не должен показывать будущую версию как уже доступную.

Старые версии:
- v0.7.7 и, если собрана старым spec, v0.7.8 лучше считать сломанными для скачивания.
- Нормальный следующий релиз: v0.7.9.
