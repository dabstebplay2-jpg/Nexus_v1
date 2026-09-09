
from PySide6.QtCore import QTimer
from PySide6.QtWidgets import QLabel
class Toast(QLabel):
    def __init__(self,parent,title,text):
        super().__init__(parent); self.setText(f"{title}\n{text}"); self.setObjectName("Panel"); self.setStyleSheet("padding:14px; border-radius:14px;"); self.adjustSize()
    def show_toast(self):
        parent=self.parent(); self.adjustSize(); self.move(parent.width()-self.width()-30, 100); self.show(); QTimer.singleShot(2400,self.deleteLater)
