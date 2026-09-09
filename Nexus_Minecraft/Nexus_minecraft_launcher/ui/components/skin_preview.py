from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QRect, Qt
from PySide6.QtGui import QColor, QFont, QPainter, QPen, QPixmap
from PySide6.QtWidgets import QWidget


class SkinFaceWidget(QWidget):
    def __init__(self, size: int = 104, parent=None):
        super().__init__(parent)
        self._skin_path: str | None = None
        self._label = "OFF"
        self.setFixedSize(size, size)

    def set_skin(self, skin_path: str | None, label: str = "OFF") -> None:
        self._skin_path = skin_path
        self._label = label or "OFF"
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, False)
        painter.fillRect(self.rect(), QColor("#07111f"))

        skin_pix = None

        if self._skin_path and Path(self._skin_path).exists():
            pix = QPixmap(self._skin_path)
            if not pix.isNull() and pix.width() >= 64 and pix.height() >= 32:
                scale = max(1, pix.width() // 64)
                face = pix.copy(QRect(8 * scale, 8 * scale, 8 * scale, 8 * scale))
                face = face.scaled(
                    self.width() - 22,
                    self.height() - 22,
                    Qt.IgnoreAspectRatio,
                    Qt.FastTransformation,
                )
                skin_pix = face

        if skin_pix:
            x = (self.width() - skin_pix.width()) // 2
            y = (self.height() - skin_pix.height()) // 2
            painter.drawPixmap(x, y, skin_pix)
        else:
            self._draw_default_face(painter)

        pen = QPen(QColor("#24d46b"))
        pen.setWidth(2)
        painter.setPen(pen)
        painter.drawRect(1, 1, self.width() - 3, self.height() - 3)

    def _draw_default_face(self, painter: QPainter) -> None:
        cell = max(7, self.width() // 9)
        start_x = (self.width() - cell * 7) // 2
        start_y = (self.height() - cell * 7) // 2

        green = QColor("#69d316")
        dark = QColor("#0c2516")
        shadow = QColor("#1d8f37")

        painter.fillRect(start_x, start_y, cell * 7, cell * 7, green)

        for x, y, c in [
            (1, 1, dark),
            (5, 1, dark),
            (2, 3, dark),
            (4, 3, dark),
            (1, 4, dark),
            (3, 4, dark),
            (5, 4, dark),
            (0, 6, shadow),
            (6, 6, shadow),
        ]:
            painter.fillRect(start_x + x * cell, start_y + y * cell, cell, cell, c)

        painter.setPen(QColor("#eafff1"))
        f = QFont()
        f.setPointSize(8)
        f.setBold(True)
        painter.setFont(f)
        painter.drawText(self.rect(), Qt.AlignBottom | Qt.AlignHCenter, self._label[:6])
