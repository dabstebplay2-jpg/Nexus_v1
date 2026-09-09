import logging
import sys
import traceback
import threading

from PySide6.QtWidgets import QApplication, QMessageBox

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
        logger.info("Checking proxy environment before cleanup")
        log_proxy_environment()

        disable_proxy_for_launcher()

        logger.info("Checking proxy environment after cleanup")
        log_proxy_environment()

        from core.i18n import set_language, detect_os_language
        from storage.paths import DATA_DIR
        import json

        settings_file = DATA_DIR / "launcher_settings.json"
        settings_data = {}
        if settings_file.exists():
            try:
                settings_data = json.loads(settings_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        lang = settings_data.get("language") or detect_os_language()
        set_language(lang)
        logger.info("Loaded language: %s", lang)

        from app.window import MainWindow

        logger.info("Creating QApplication")
        app = QApplication(sys.argv)

        from ui.styles import get_app_style
        theme = settings_data.get("theme", "dark")
        try:
            app.setStyleSheet(get_app_style(theme))
            logger.info("Applied theme: %s", theme)
        except Exception:
            logger.exception("Failed to apply saved theme")
            app.setStyleSheet(get_app_style("dark"))

        logger.info("Creating main window")
        window = MainWindow()
        window.show()

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
