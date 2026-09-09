
from PySide6.QtCore import Signal
from PySide6.QtWidgets import QWidget,QVBoxLayout,QHBoxLayout,QLabel,QPushButton,QFrame
from ui.utils.image_loader import RemoteImageLabel
def fmt(v):
    try: return f"{int(v):,}".replace(',', ' ')
    except Exception: return '0'
class ModCard(QWidget):
    install_clicked=Signal(object); details_clicked=Signal(object)
    def __init__(self,project):
        super().__init__(); self.project=project; self.setObjectName('ModCard'); self.setMinimumHeight(220)
        root=QVBoxLayout(self); root.setContentsMargins(16,14,16,14); root.setSpacing(10)
        head=QHBoxLayout(); box=QFrame(); box.setObjectName('ModIconBox'); box.setFixedSize(58,58); bl=QVBoxLayout(box); bl.setContentsMargins(0,0,0,0)
        icon=RemoteImageLabel(58,58,'◆'); icon.set_remote_image(project.get('icon_url')); bl.addWidget(icon)
        tb=QVBoxLayout(); title=QLabel(project.get('title','Без названия')); title.setObjectName('InstanceTitle'); title.setWordWrap(True); author=QLabel('by '+str(project.get('author','unknown'))); author.setObjectName('InstanceMeta'); tb.addWidget(title); tb.addWidget(author)
        head.addWidget(box); head.addLayout(tb); head.addStretch()
        desc=QLabel(project.get('description','Описание отсутствует.')); desc.setObjectName('PanelText'); desc.setWordWrap(True); desc.setMaximumHeight(56)
        stats=QHBoxLayout(); stats.addWidget(self.badge(f"{fmt(project.get('downloads',0))} скачиваний"));
        for c in (project.get('categories') or [])[:2]: stats.addWidget(self.badge(c))
        stats.addStretch()
        buttons=QHBoxLayout(); install=QPushButton('Установить'); install.setObjectName('PrimaryButton'); install.clicked.connect(lambda checked=False: self.install_clicked.emit(self.project)); details=QPushButton('Подробнее'); details.setObjectName('SecondaryButton'); details.clicked.connect(lambda checked=False: self.details_clicked.emit(self.project)); buttons.addWidget(install); buttons.addWidget(details); buttons.addStretch()
        root.addLayout(head); root.addWidget(desc); root.addLayout(stats); root.addStretch(); root.addLayout(buttons)
    def badge(self,text): l=QLabel(str(text)); l.setObjectName('InstanceBadge'); return l
