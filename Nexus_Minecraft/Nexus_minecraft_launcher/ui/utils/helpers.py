from PySide6.QtWidgets import QLayout


def clear_layout(layout: QLayout):
    while layout.count():
        item = layout.takeAt(0)
        widget = item.widget()
        child_layout = item.layout()
        if widget:
            widget.deleteLater()
        if child_layout:
            clear_layout(child_layout)
