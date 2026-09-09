from __future__ import annotations

from PySide6.QtCore import Signal, Qt
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QPushButton, QVBoxLayout, QWidget


class CollapsibleHeader(QFrame):
    toggled = Signal(bool)

    def __init__(self, title: str, subtitle: str = "", collapsed: bool = False, parent=None):
        super().__init__(parent)
        self.setObjectName("CollapsibleHeader")
        self._collapsed = bool(collapsed)

        root = QVBoxLayout(self)
        root.setContentsMargins(16, 14, 16, 14)
        root.setSpacing(12)

        top = QHBoxLayout()
        title_box = QVBoxLayout()
        title_box.setSpacing(3)

        self.title_label = QLabel(title)
        self.title_label.setObjectName("PageTitle")
        self.subtitle_label = QLabel(subtitle)
        self.subtitle_label.setObjectName("PageDescription")
        self.subtitle_label.setWordWrap(True)

        title_box.addWidget(self.title_label)
        if subtitle:
            title_box.addWidget(self.subtitle_label)

        self.toggle_btn = QPushButton()
        self.toggle_btn.setObjectName("ToggleFiltersButton")
        self.toggle_btn.setCursor(Qt.PointingHandCursor)
        self.toggle_btn.clicked.connect(self.toggle)

        top.addLayout(title_box, 1)
        top.addWidget(self.toggle_btn, 0, Qt.AlignTop)

        self.body = QWidget()
        self.body_layout = QVBoxLayout(self.body)
        self.body_layout.setContentsMargins(0, 0, 0, 0)
        self.body_layout.setSpacing(12)

        root.addLayout(top)
        root.addWidget(self.body)
        self.set_collapsed(self._collapsed, emit=False)

    def add_layout(self, layout):
        self.body_layout.addLayout(layout)

    def add_widget(self, widget):
        self.body_layout.addWidget(widget)

    def toggle(self):
        self.set_collapsed(not self._collapsed)

    def set_collapsed(self, collapsed: bool, emit: bool = True):
        self._collapsed = bool(collapsed)
        self.body.setVisible(not self._collapsed)
        self.toggle_btn.setText("Развернуть" if self._collapsed else "Свернуть")
        if emit:
            self.toggled.emit(self._collapsed)

    def is_collapsed(self) -> bool:
        return self._collapsed
