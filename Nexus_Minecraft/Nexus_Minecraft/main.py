import logging
import sys
import traceback
import threading
from pathlib import Path

from PySide6.QtWidgets import QApplication, QMessageBox
from PySide6.QtGui import QIcon

from core.logger import setup_logging
from core.network_manager import disable_proxy_for_launcher, log_proxy_environment


def install_global_exception_hooks():
    def log_unhandled_exception(exc_type, exc_value, exc_traceback):
        logging.getLogger(__name__).critical(
            "Unhandled exception",
            exc_info=(exc_type, exc_value, exc_traceback),
        )

    def log_thread_exception(args):
        logging.getLogger(__name__).critical(
            "Unhandled thread exception in %s",
            getattr(args.thread, "name", "thread"),
            exc_info=(args.exc_type, args.exc_value, args.exc_traceback),
        )

    sys.excepthook = log_unhandled_exception
    threading.excepthook = log_thread_exception


def show_fatal_error(error: BaseException):
    message = QMessageBox()
    message.setIcon(QMessageBox.Critical)
    message.setWindowTitle("Nexus Launcher — ошибка запуска")
    message.setText("Не удалось запустить Nexus Launcher.")
    message.setInformativeText(str(error))
    message.setDetailedText(traceback.format_exc())
    message.exec()


def main():
    setup_logging()
    install_global_exception_hooks()
    logger = logging.getLogger(__name__)

    if "--diagnose" in sys.argv:
        from tools.diagnose_nexus import run_diagnostics
        run_diagnostics()
        return

    try:
        try:
            from core.windows_app_id import set_windows_app_id
            set_windows_app_id()
        except Exception:
            logger.debug("Windows AppUserModelID setup skipped", exc_info=True)

        logger.info("Checking proxy environment before cleanup")
        log_proxy_environment()

        disable_proxy_for_launcher()

        logger.info("Checking proxy environment after cleanup")
        log_proxy_environment()

        from core.i18n import set_language
        from storage.paths import DATA_DIR
        import json

        settings_file = DATA_DIR / "launcher_settings.json"
        settings_data = {}
        if settings_file.exists():
            try:
                settings_data = json.loads(settings_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        lang = "ru"
        if settings_data.get("language") != lang:
            try:
                settings_data["language"] = lang
                settings_file.parent.mkdir(parents=True, exist_ok=True)
                settings_file.write_text(json.dumps(settings_data, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception:
                logger.debug("Could not persist forced launcher language", exc_info=True)
        set_language(lang)
        logger.info("Loaded language: %s", lang)

        from app.window import MainWindow

        logger.info("Creating QApplication")
        app = QApplication(sys.argv)
        try:
            from ui.wheel_guard import install_no_wheel_value_changes
            install_no_wheel_value_changes(app)
        except Exception:
            logger.debug("Wheel guard setup skipped", exc_info=True)
        try:
            app.setApplicationName("Nexus Launcher")
            app.setApplicationDisplayName("Nexus Launcher")
            app.setOrganizationName("Nexus Minecraft")
        except Exception:
            pass

        try:
            app_icon = Path(__file__).resolve().parent / "assets" / "nexus.ico"
            if app_icon.exists():
                app.setWindowIcon(QIcon(str(app_icon)))
        except Exception:
            pass

        from ui.styles import get_app_style
        theme = settings_data.get("theme", "dark")
        if theme == "light":
            theme = "dark"
        try:
            app.setStyleSheet(get_app_style(theme))
            logger.info("Applied theme: %s", theme)
        except Exception:
            logger.exception("Failed to apply saved theme")
            app.setStyleSheet(get_app_style("dark"))

        logger.info("Creating main window")
        window = MainWindow()
        window.show()

        try:
            from core.discord_presence import discord_presence
            discord_presence().set_launcher_idle("Главная")
        except Exception:
            logger.debug("Discord presence startup skipped", exc_info=True)

        if "--open-updates" in sys.argv:
            from PySide6.QtCore import QTimer
            from app.window import PageIndex

            def open_updates_page():
                try:
                    window.change_page(PageIndex.SETTINGS)
                    if hasattr(window.settings_page, "check_updates_from_settings"):
                        window.settings_page.check_updates_from_settings()
                except Exception:
                    logger.exception("Failed to open updates page")

            QTimer.singleShot(500, open_updates_page)

        logger.info("Application event loop started")
        exit_code = app.exec()

        try:
            from core.discord_presence import discord_presence
            discord_presence().close()
        except Exception:
            pass

        logger.info("Application closed with code %s", exit_code)
        sys.exit(exit_code)

    except Exception as error:
        logger.exception("Fatal application error")

        try:
            app = QApplication.instance() or QApplication(sys.argv)
            show_fatal_error(error)
        except Exception:
            pass

        sys.exit(1)


if __name__ == "__main__":
    main()
