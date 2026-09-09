from __future__ import annotations

import sys

from PySide6.QtCore import QObject, QEvent
from PySide6.QtWidgets import (
    QAbstractItemView,
    QAbstractSlider,
    QAbstractSpinBox,
    QComboBox,
    QPlainTextEdit,
    QScrollArea,
    QTextEdit,
    QWidget,
)

_SPI_GETWHEELSCROLLLINES = 0x0068
_WHEEL_DELTA = 120


def windows_wheel_scroll_lines(default: int = 3) -> int:
    """Windows SPI_GETWHEELSCROLLLINES; -1 means scroll one page per notch."""
    if sys.platform != "win32":
        return default
    try:
        import ctypes

        lines = ctypes.c_uint()
        if ctypes.windll.user32.SystemParametersInfoW(
            _SPI_GETWHEELSCROLLLINES, 0, ctypes.byref(lines), 0
        ):
            value = int(lines.value)
            if value == 0xFFFFFFFF:
                return -1
            if value > 0:
                return value
    except (AttributeError, OSError, ValueError):
        pass
    return default


class NoWheelValueChangeFilter(QObject):
    """Prevent accidental value changes and apply Windows-like scroll speed."""

    def eventFilter(self, obj, event):
        if event.type() != QEvent.Type.Wheel:
            return super().eventFilter(obj, event)

        if isinstance(obj, QComboBox) and obj.view() is not None and obj.view().isVisible():
            return super().eventFilter(obj, event)

        angle = event.angleDelta()
        if abs(angle.x()) > abs(angle.y()) and angle.y() == 0:
            return super().eventFilter(obj, event)

        blocking_control = isinstance(
            obj,
            (QAbstractSlider, QAbstractSpinBox, QComboBox),
        )
        scroll_target = self._wheel_scroll_target(obj)

        if scroll_target is None:
            if blocking_control:
                return True
            return super().eventFilter(obj, event)

        bar = scroll_target.verticalScrollBar()
        if bar is None or bar.maximum() <= bar.minimum():
            if blocking_control:
                return True
            return super().eventFilter(obj, event)

        old_value = bar.value()
        delta = self._compute_scroll_delta(event, scroll_target)
        if delta:
            bar.setValue(old_value - delta)

        if blocking_control or delta:
            return True
        return super().eventFilter(obj, event)

    def _wheel_scroll_target(self, widget: QWidget | None):
        current = widget
        best_area = None
        while current is not None:
            if isinstance(current, (QAbstractItemView, QPlainTextEdit, QTextEdit)):
                bar = current.verticalScrollBar()
                if bar is not None and bar.maximum() > bar.minimum():
                    return current
            if isinstance(current, QScrollArea):
                best_area = current
            current = current.parent()
        return best_area

    def _compute_scroll_delta(self, event, scroll_target: QWidget) -> int:
        bar = scroll_target.verticalScrollBar()
        page_step = bar.pageStep() if bar else 120
        line_step = max(bar.singleStep() if bar else 20, 16)

        angle_delta = event.angleDelta().y()
        if angle_delta:
            lines = windows_wheel_scroll_lines()
            if lines == -1:
                return page_step if angle_delta < 0 else -page_step
            notches = angle_delta / _WHEEL_DELTA
            return int(notches * lines * line_step)

        pixel_delta = event.pixelDelta()
        if not pixel_delta.isNull() and pixel_delta.y() != 0:
            return int(pixel_delta.y())

        return 0

    def _nearest_scroll_area(self, widget):
        parent = widget.parent()
        while parent is not None:
            if isinstance(parent, QScrollArea):
                return parent
            parent = parent.parent()
        return None

    def _scroll_parent(self, scroll_area: QScrollArea, event):
        bar = scroll_area.verticalScrollBar()
        if not bar:
            return
        delta = self._compute_scroll_delta(event, scroll_area)
        if delta:
            bar.setValue(bar.value() - delta)


_wheel_filter: NoWheelValueChangeFilter | None = None


def install_no_wheel_value_changes(app):
    global _wheel_filter
    if _wheel_filter is None:
        _wheel_filter = NoWheelValueChangeFilter(app)
        app.installEventFilter(_wheel_filter)
    return _wheel_filter
