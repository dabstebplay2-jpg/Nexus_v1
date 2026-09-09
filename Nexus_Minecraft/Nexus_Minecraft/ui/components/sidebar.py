from PySide6.QtCore import Signal, Qt, QSize
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QFrame,
    QSizePolicy,
)

try:
    from ui.icon_utils import icon
except Exception:
    icon = None

from ui.components.skin_preview import SkinFaceWidget

COMPACT_WIDTH = 66
EXPANDED_WIDTH = 220


def get_icon(name):
    if not icon:
        return None
    try:
        return icon(name)
    except Exception:
        return None


class SidebarButton(QPushButton):
    def __init__(self, icon_name, text, index):
        super().__init__(text)
        self.index = index
        self.icon_name = icon_name
        self.setObjectName("SidebarNavButton")
        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(44)
        self.setCheckable(True)
        self.setProperty("active", False)
        self.apply_icon()

    def apply_icon(self):
        qicon = get_icon(self.icon_name)
        if qicon:
            self.setIcon(qicon)
            self.setIconSize(QSize(18, 18))


class ClickableLogoCard(QFrame):
    clicked = Signal()

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.clicked.emit()
            event.accept()
            return
        super().mousePressEvent(event)


class ClickableProfileCard(QFrame):
    clicked = Signal()

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.clicked.emit()
            event.accept()
            return
        super().mousePressEvent(event)


class Sidebar(QWidget):
    page_changed = Signal(int)
    profile_clicked = Signal()
    collapsed_changed = Signal(bool)

    def __init__(self):
        super().__init__()

        self.setObjectName("Sidebar")
        self.setFixedWidth(EXPANDED_WIDTH)
        self.compact = False
        self._logo_text_widgets = []
        self._profile_text_widgets = []
        self._section_titles = []

        self.buttons = []
        self.disabled_pages = set()

        self.root_layout = QVBoxLayout(self)
        root = self.root_layout
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(8)

        root.addWidget(self._create_logo_card())
        root.addSpacing(4)

        nav_title = QLabel("ОСНОВНОЕ")
        nav_title.setObjectName("SidebarSectionTitle")
        self._section_titles.append(nav_title)
        root.addWidget(nav_title)

        for icon_name, text, index in [
            ("home", "Главная", 0),
            ("instances", "Сборки", 1),
            ("mods", "Каталог", 2),
            ("library", "Библиотека", 3),
            ("downloads", "Загрузки", 4),
        ]:
            root.addWidget(self._create_nav_button(icon_name, text, index))

        root.addSpacing(8)

        system_title = QLabel("СИСТЕМА")
        system_title.setObjectName("SidebarSectionTitle")
        self._section_titles.append(system_title)
        root.addWidget(system_title)

        for icon_name, text, index in [
            ("settings", "Настройки", 6),
            ("logs", "Логи", 7),
        ]:
            root.addWidget(self._create_nav_button(icon_name, text, index))

        root.addStretch()
        self.profile_card = self._create_profile_card()
        root.addWidget(self.profile_card)

    def _create_logo_card(self):
        card = ClickableLogoCard()
        card.setObjectName("SidebarLogoCard")
        card.setMinimumHeight(74)
        card.clicked.connect(self._on_logo_clicked)
        self.logo_card = card

        layout = QHBoxLayout(card)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(8)

        mark = QLabel()
        mark.setObjectName("NexusMark")
        mark.setAlignment(Qt.AlignCenter)
        mark.setFixedSize(48, 48)
        self.logo_mark = mark
        self._apply_logo_icon()

        text = QVBoxLayout()
        text.setSpacing(0)

        title = QLabel("NEXUS")
        title.setObjectName("NexusLogoTitle")
        title.setMinimumWidth(100)
        title.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)

        subtitle = QLabel("Launcher")
        subtitle.setObjectName("NexusLogoSubtitle")
        subtitle.setMinimumWidth(100)
        subtitle.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        self._logo_text_widgets.extend([title, subtitle])

        text.addWidget(title)
        text.addWidget(subtitle)

        self.collapse_button = QPushButton()
        self.collapse_button.setObjectName("SidebarCollapseButton")
        self.collapse_button.setCursor(Qt.PointingHandCursor)
        self.collapse_button.setToolTip("Свернуть панель")
        self.collapse_button.setFixedSize(30, 30)
        chevron = get_icon("chevron-left")
        if chevron:
            self.collapse_button.setIcon(chevron)
            self.collapse_button.setIconSize(QSize(16, 16))
        self.collapse_button.clicked.connect(self._collapse_sidebar)

        layout.addWidget(mark)
        layout.addLayout(text, 1)
        layout.addWidget(self.collapse_button, 0, Qt.AlignTop)
        return card

    def _apply_logo_icon(self):
        if not hasattr(self, "logo_mark") or self.logo_mark is None:
            return

        qicon = get_icon("nexus")
        if qicon:
            size = 40 if self.compact else 48
            self.logo_mark.setPixmap(qicon.pixmap(QSize(size, size)))

    def _create_nav_button(self, icon_name, text, index):
        button = SidebarButton(icon_name, text, index)
        button.full_text = text
        button.clicked.connect(lambda checked=False, i=index: self.page_changed.emit(i))
        self.buttons.append(button)
        return button

    def _collapse_sidebar(self):
        self.set_compact(True)
        self.collapsed_changed.emit(True)

    def _expand_sidebar(self):
        self.set_compact(False)
        self.collapsed_changed.emit(False)

    def _on_logo_clicked(self):
        if self.compact:
            self._expand_sidebar()

    def set_compact(self, compact: bool):
        compact = bool(compact)
        if self.compact == compact:
            return

        self.compact = compact
        self.setProperty("compact", compact)
        self.setProperty("collapsed", compact)
        self.style().unpolish(self)
        self.style().polish(self)

        width = COMPACT_WIDTH if compact else EXPANDED_WIDTH
        self.setFixedWidth(width)
        self.setMinimumWidth(width)
        self.setMaximumWidth(width)
        self.root_layout.setContentsMargins(4 if compact else 12, 10 if compact else 12, 4 if compact else 12, 10 if compact else 12)
        self.root_layout.setSpacing(8)

        for button in self.buttons:
            button.setText("" if compact else getattr(button, "full_text", button.text()))
            button.setProperty("compact", compact)
            button.setMinimumHeight(40 if compact else 44)
            button.setFixedWidth(48 if compact else 196)
            button.setIconSize(QSize(20, 20) if compact else QSize(18, 18))
            button.setToolTip(getattr(button, "full_text", ""))
            button.setSizePolicy(QSizePolicy.Fixed if compact else QSizePolicy.Expanding, QSizePolicy.Fixed)
            button.style().unpolish(button)
            button.style().polish(button)

        for widget in self._logo_text_widgets + self._profile_text_widgets + self._section_titles:
            widget.setVisible(not compact)

        self.collapse_button.setVisible(not compact)
        self.logo_card.setProperty("compact", compact)
        self.logo_card.setProperty("collapsedLogo", compact)
        self.profile_card.setProperty("compact", compact)
        self.logo_card.setFixedSize(58 if compact else 196, 76 if compact else 74)
        self.profile_card.setFixedSize(58 if compact else 196, 58 if compact else 60)
        self.logo_mark.setFixedSize(44 if compact else 48, 44 if compact else 48)
        for card in (self.logo_card, self.profile_card):
            layout = card.layout()
            if layout:
                layout.setContentsMargins(6 if compact else 10, 7 if compact else 9, 6 if compact else 10, 7 if compact else 9)
                layout.setSpacing(0 if compact else 10)
            card.style().unpolish(card)
            card.style().polish(card)

        if compact:
            self.logo_card.setToolTip("Развернуть меню")
            self.logo_card.setCursor(Qt.PointingHandCursor)
        else:
            self.logo_card.setToolTip("")
            self.logo_card.setCursor(Qt.ArrowCursor)

        self._apply_logo_icon()

        parent = self.parentWidget()
        if parent is not None:
            parent.updateGeometry()
        self.updateGeometry()

    def set_collapsed(self, collapsed: bool):
        self.set_compact(collapsed)

    def set_active(self, index):
        for button in self.buttons:
            active = button.index == index
            button.setChecked(active)
            button.setProperty("active", active)
            button.style().unpolish(button)
            button.style().polish(button)

        if hasattr(self, "profile_card") and self.profile_card:
            active_profile = index == 5
            self.profile_card.setProperty("active", active_profile)
            self.profile_card.style().unpolish(self.profile_card)
            self.profile_card.style().polish(self.profile_card)

    def set_disabled_pages(self, pages):
        self.disabled_pages = set(pages or [])
        for button in self.buttons:
            disabled = button.index in self.disabled_pages
            button.setProperty("disabledPage", disabled)
            button.style().unpolish(button)
            button.style().polish(button)

    def _create_profile_card(self):
        card = ClickableProfileCard()
        card.setObjectName("SidebarProfileCard")
        card.setCursor(Qt.PointingHandCursor)
        card.clicked.connect(self.profile_clicked.emit)
        card.setMinimumHeight(60)

        layout = QHBoxLayout(card)
        layout.setContentsMargins(10, 9, 10, 9)
        layout.setSpacing(10)

        avatar = SkinFaceWidget(38)
        avatar.setObjectName("SidebarAvatar")
        self.profile_avatar = avatar

        info = QVBoxLayout()
        info.setSpacing(1)

        name = QLabel("NexusPlayer")
        name.setObjectName("SidebarProfileName")
        self.profile_name_label = name

        status = QLabel("Offline")
        status.setObjectName("SidebarProfileStatus")
        self.profile_status_label = status
        self._profile_text_widgets.extend([name, status])

        info.addWidget(name)
        info.addWidget(status)

        arrow = QLabel("⌄")
        arrow.setObjectName("SidebarProfileArrow")
        arrow.setAlignment(Qt.AlignCenter)
        self._profile_text_widgets.append(arrow)

        layout.addWidget(avatar)
        layout.addLayout(info)
        layout.addStretch()
        layout.addWidget(arrow)

        card.setToolTip("Профиль, аккаунты и скины")
        return card

    def refresh_theme(self, theme: str | None = None):
        for button in self.buttons:
            button.apply_icon()
            if self.compact:
                button.setIconSize(QSize(20, 20))
            else:
                button.setIconSize(QSize(18, 18))

        self._apply_logo_icon()
        self.update_profile()

    def update_profile(self):
        username = "NexusPlayer"
        status = "Offline"
        skin_path = None

        try:
            from auth.account_manager import AccountManager
            from core.skin_manager import SkinManager

            account = AccountManager().get_active_account()
            if account:
                username = (
                    account.get("display_name")
                    or account.get("username")
                    or username
                )
                provider = str(account.get("provider") or account.get("type") or "").lower()
                if provider in {"microsoft", "ely", "elyby"}:
                    status = provider.capitalize()
                elif account.get("token"):
                    status = "Online"
                skin = SkinManager().get_account_skin(account)
                if skin:
                    skin_path = skin.get("path")
        except Exception:
            pass

        if hasattr(self, "profile_avatar") and self.profile_avatar:
            self.profile_avatar.set_skin(skin_path, username)
        if hasattr(self, "profile_name_label") and self.profile_name_label:
            self.profile_name_label.setText(username)
        if hasattr(self, "profile_status_label") and self.profile_status_label:
            self.profile_status_label.setText(status)
