from __future__ import annotations

import math
from pathlib import Path

from PySide6.QtCore import QPointF, QRect, Qt
from PySide6.QtGui import QColor, QFont, QPainter, QPainterPath, QPen, QPixmap, QPolygonF
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
        cell = max(3, min(self.width(), self.height()) // 9)
        start_x = (self.width() - cell * 7) // 2
        start_y = (self.height() - cell * 7) // 2

        base = QColor("#6f8d66")
        dark = QColor("#18251c")
        shadow = QColor("#405d45")

        painter.fillRect(start_x, start_y, cell * 7, cell * 7, base)

        for x, y, c in [
            (1, 1, shadow),
            (5, 1, shadow),
            (2, 3, dark),
            (3, 3, dark),
            (4, 3, dark),
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


class Skin3DPreviewWidget(QWidget):
    def __init__(self, width: int = 210, height: int = 250, parent=None):
        super().__init__(parent)
        self._skin_path: str | None = None
        self._label = "NEXUS"
        self._yaw = -28.0
        self._pitch = -8.0
        self._zoom = 1.0
        self._drag_pos = None
        self.setMouseTracking(True)
        self.setCursor(Qt.OpenHandCursor)
        self.setToolTip("Перетащи мышью, чтобы повернуть. Колесо — масштаб. Двойной клик — сброс.")
        self.setMinimumSize(width, height)

    def set_skin(self, skin_path: str | None, label: str = "NEXUS") -> None:
        self._skin_path = skin_path
        self._label = label or "NEXUS"
        self.update()

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._drag_pos = event.position()
            self.setCursor(Qt.ClosedHandCursor)
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._drag_pos is not None:
            pos = event.position()
            delta = pos - self._drag_pos
            self._drag_pos = pos
            self._yaw = (self._yaw + delta.x() * 0.55) % 360
            self._pitch = max(-35.0, min(25.0, self._pitch - delta.y() * 0.35))
            self.update()
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._drag_pos = None
            self.setCursor(Qt.OpenHandCursor)
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def wheelEvent(self, event):
        steps = event.angleDelta().y() / 120.0
        if steps:
            self._zoom = max(0.72, min(1.45, self._zoom + steps * 0.06))
            self.update()
            event.accept()
            return
        super().wheelEvent(event)

    def mouseDoubleClickEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._yaw = -28.0
            self._pitch = -8.0
            self._zoom = 1.0
            self.update()
            event.accept()
            return
        super().mouseDoubleClickEvent(event)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)
        painter.fillRect(self.rect(), QColor("#07100c"))
        self._draw_stage(painter)

        skin = QPixmap(self._skin_path) if self._skin_path and Path(self._skin_path).exists() else QPixmap()
        scale = max(1, skin.width() // 64) if not skin.isNull() and skin.width() >= 64 else 1

        self._draw_model(painter, skin, scale)

        painter.setPen(QColor("#dff5d7"))
        font = QFont()
        font.setBold(True)
        font.setPointSize(9)
        painter.setFont(font)
        painter.drawText(0, self.height() - 24, self.width(), 18, Qt.AlignCenter, self._label[:18])

        painter.setPen(QColor("#8fbf87"))
        hint_font = QFont()
        hint_font.setPointSize(7)
        hint_font.setBold(True)
        painter.setFont(hint_font)
        painter.drawText(0, 10, self.width() - 10, 14, Qt.AlignRight, "drag • wheel")

    def _draw_stage(self, painter: QPainter) -> None:
        floor = QPolygonF([
            QPointF(self.width() * 0.22, self.height() * 0.80),
            QPointF(self.width() * 0.78, self.height() * 0.80),
            QPointF(self.width() * 0.66, self.height() * 0.91),
            QPointF(self.width() * 0.34, self.height() * 0.91),
        ])
        painter.setPen(Qt.NoPen)
        painter.setBrush(QColor(22, 40, 27, 95))
        painter.drawPolygon(floor)

    def _draw_model(self, painter: QPainter, skin: QPixmap, scale: int) -> None:
        has_skin = not skin.isNull() and skin.width() >= 64 and skin.height() >= 32
        has_second_layer = has_skin and skin.height() >= 64 * scale

        boxes = [
            self._box("left_arm", (-5.85, 2, 0), (4, 12, 4), {
                "front": (44, 20, 4, 12), "back": (52, 20, 4, 12), "right": (40, 20, 4, 12),
                "left": (48, 20, 4, 12), "top": (44, 16, 4, 4), "bottom": (48, 16, 4, 4),
                "overlay_front": (44, 36, 4, 12) if has_second_layer else None,
            }, QColor("#d8d8d8")),
            self._box("right_arm", (5.85, 2, 0), (4, 12, 4), {
                "front": (36, 52, 4, 12) if has_second_layer else (44, 20, 4, 12),
                "back": (44, 52, 4, 12) if has_second_layer else (52, 20, 4, 12),
                "right": (32, 52, 4, 12) if has_second_layer else (40, 20, 4, 12),
                "left": (40, 52, 4, 12) if has_second_layer else (48, 20, 4, 12),
                "top": (36, 48, 4, 4) if has_second_layer else (44, 16, 4, 4),
                "bottom": (40, 48, 4, 4) if has_second_layer else (48, 16, 4, 4),
                "overlay_front": (52, 52, 4, 12) if has_second_layer else None,
            }, QColor("#d8d8d8")),
            self._box("left_leg", (-1.95, 14, 0), (4, 12, 4), {
                "front": (4, 20, 4, 12), "back": (12, 20, 4, 12), "right": (0, 20, 4, 12),
                "left": (8, 20, 4, 12), "top": (4, 16, 4, 4), "bottom": (8, 16, 4, 4),
                "overlay_front": (4, 36, 4, 12) if has_second_layer else None,
            }, QColor("#bfc2c1")),
            self._box("right_leg", (1.95, 14, 0), (4, 12, 4), {
                "front": (20, 52, 4, 12) if has_second_layer else (4, 20, 4, 12),
                "back": (28, 52, 4, 12) if has_second_layer else (12, 20, 4, 12),
                "right": (16, 52, 4, 12) if has_second_layer else (0, 20, 4, 12),
                "left": (24, 52, 4, 12) if has_second_layer else (8, 20, 4, 12),
                "top": (20, 48, 4, 4) if has_second_layer else (4, 16, 4, 4),
                "bottom": (24, 48, 4, 4) if has_second_layer else (8, 16, 4, 4),
                "overlay_front": (4, 52, 4, 12) if has_second_layer else None,
            }, QColor("#bfc2c1")),
            self._box("body", (0, 2, 0), (8, 12, 4), {
                "front": (20, 20, 8, 12), "back": (32, 20, 8, 12), "right": (16, 20, 4, 12),
                "left": (28, 20, 4, 12), "top": (20, 16, 8, 4), "bottom": (28, 16, 8, 4),
                "overlay_front": (20, 36, 8, 12) if has_second_layer else None,
            }, QColor("#836c62")),
            self._box("head", (0, -8, 0), (8, 8, 8), {
                "front": (8, 8, 8, 8), "back": (24, 8, 8, 8), "right": (0, 8, 8, 8),
                "left": (16, 8, 8, 8), "top": (8, 0, 8, 8), "bottom": (16, 0, 8, 8),
                "overlay_front": (40, 8, 8, 8) if has_second_layer else None,
            }, QColor("#8a665c")),
        ]

        faces = []
        for box in boxes:
            faces.extend(self._visible_faces_for_box(box, skin, scale, has_skin))

        for face in sorted(faces, key=lambda item: item["depth"]):
            self._draw_face(painter, face)

    def _box(self, name: str, center, size, uv: dict, fallback: QColor) -> dict:
        cx, cy, cz = center
        sx, sy, sz = size
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        return {
            "name": name,
            "fallback": fallback,
            "uv": uv,
            "corners": {
                "lbf": (cx - hx, cy + hy, cz + hz),
                "rbf": (cx + hx, cy + hy, cz + hz),
                "rtf": (cx + hx, cy - hy, cz + hz),
                "ltf": (cx - hx, cy - hy, cz + hz),
                "lbb": (cx - hx, cy + hy, cz - hz),
                "rbb": (cx + hx, cy + hy, cz - hz),
                "rtb": (cx + hx, cy - hy, cz - hz),
                "ltb": (cx - hx, cy - hy, cz - hz),
            },
            "faces": {
                "front": ("lbf", "rbf", "rtf", "ltf"),
                "back": ("rbb", "lbb", "ltb", "rtb"),
                "left": ("lbb", "lbf", "ltf", "ltb"),
                "right": ("rbf", "rbb", "rtb", "rtf"),
                "top": ("ltf", "rtf", "rtb", "ltb"),
                "bottom": ("lbb", "rbb", "rbf", "lbf"),
            },
            "normals": {
                "front": (0, 0, 1),
                "back": (0, 0, -1),
                "left": (-1, 0, 0),
                "right": (1, 0, 0),
                "top": (0, -1, 0),
                "bottom": (0, 1, 0),
            },
        }

    def _visible_faces_for_box(self, box: dict, skin: QPixmap, scale: int, has_skin: bool) -> list[dict]:
        faces = []
        transformed = {key: self._transform_point(value) for key, value in box["corners"].items()}
        projected = {key: self._project_point(value) for key, value in transformed.items()}

        for face_name, keys in box["faces"].items():
            normal_z = self._transform_vector(box["normals"][face_name])[2]
            if normal_z <= 0.02:
                continue
            points_3d = [transformed[key] for key in keys]

            uv = box["uv"].get(face_name)
            pixmap = self._skin_part(skin, scale, uv) if has_skin and uv else QPixmap()
            color = self._average_color(pixmap, box["fallback"])
            light = self._face_light(face_name, normal_z)
            color = color.lighter(light) if light >= 100 else color.darker(200 - light)

            faces.append({
                "points": [projected[key] for key in keys],
                "color": color,
                "pixmap": pixmap,
                "depth": sum(point[2] for point in points_3d) / len(points_3d),
                "overlay": self._skin_part(skin, scale, box["uv"].get(f"overlay_{face_name}")) if has_skin and box["uv"].get(f"overlay_{face_name}") else QPixmap(),
            })

        return faces

    def _transform_point(self, point):
        x, y, z = point
        yaw = math.radians(self._yaw)
        pitch = math.radians(self._pitch)

        cos_y, sin_y = math.cos(yaw), math.sin(yaw)
        x2 = x * cos_y + z * sin_y
        z2 = -x * sin_y + z * cos_y

        cos_p, sin_p = math.cos(pitch), math.sin(pitch)
        y2 = y * cos_p - z2 * sin_p
        z3 = y * sin_p + z2 * cos_p
        return x2, y2, z3

    def _transform_vector(self, vector):
        x, y, z = vector
        yaw = math.radians(self._yaw)
        pitch = math.radians(self._pitch)

        cos_y, sin_y = math.cos(yaw), math.sin(yaw)
        x2 = x * cos_y + z * sin_y
        z2 = -x * sin_y + z * cos_y

        cos_p, sin_p = math.cos(pitch), math.sin(pitch)
        y2 = y * cos_p - z2 * sin_p
        z3 = y * sin_p + z2 * cos_p
        return x2, y2, z3

    def _project_point(self, point) -> QPointF:
        x, y, z = point
        scale = min(self.width() / 20, (self.height() - 42) / 34) * self._zoom
        return QPointF(self.width() / 2 + x * scale, self.height() * 0.50 + y * scale)

    def _face_light(self, face_name: str, normal_z: float) -> int:
        base = {
            "front": 112,
            "top": 126,
            "left": 96,
            "right": 104,
            "back": 88,
            "bottom": 78,
        }.get(face_name, 100)
        return max(72, min(138, int(base + normal_z * 1.5)))

    def _draw_face(self, painter: QPainter, face: dict) -> None:
        polygon = QPolygonF(face["points"])
        painter.setPen(Qt.NoPen)
        painter.setBrush(face["color"])
        painter.drawPolygon(polygon)

        if not face["pixmap"].isNull():
            path = QPainterPath()
            path.addPolygon(polygon)
            painter.save()
            painter.setClipPath(path)
            target = polygon.boundingRect()
            painter.drawPixmap(target, face["pixmap"], face["pixmap"].rect())
            if not face["overlay"].isNull():
                painter.drawPixmap(target, face["overlay"], face["overlay"].rect())
            painter.restore()

        painter.setPen(QPen(QColor(10, 18, 13, 135), 1))
        painter.setBrush(Qt.NoBrush)
        painter.drawPolygon(polygon)

    def _skin_part(self, skin: QPixmap, scale: int, uv: tuple[int, int, int, int]) -> QPixmap:
        if skin.isNull() or uv is None:
            return QPixmap()
        x, y, w, h = uv
        return skin.copy(QRect(x * scale, y * scale, w * scale, h * scale))

    def _average_color(self, pixmap: QPixmap, fallback: QColor) -> QColor:
        if pixmap.isNull():
            return fallback

        image = pixmap.toImage()
        red = green = blue = count = 0
        step_x = max(1, image.width() // 4)
        step_y = max(1, image.height() // 4)

        for y in range(0, image.height(), step_y):
            for x in range(0, image.width(), step_x):
                color = image.pixelColor(x, y)
                if color.alpha() == 0:
                    continue
                red += color.red()
                green += color.green()
                blue += color.blue()
                count += 1

        if not count:
            return fallback
        return QColor(red // count, green // count, blue // count)

    def _draw_empty_model(self, painter: QPainter) -> None:
        self._draw_model(painter, QPixmap(), 1)
        painter.setPen(QColor("#dff5d7"))
        font = QFont()
        font.setBold(True)
        font.setPointSize(9)
        painter.setFont(font)
        painter.drawText(0, self.height() - 22, self.width(), 18, Qt.AlignCenter, "Скин не выбран")
