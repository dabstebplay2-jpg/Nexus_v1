
import hashlib, logging
from pathlib import Path
import requests
from PySide6.QtCore import QThread, Signal, Qt
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import QLabel
try:
    from storage.paths import STORAGE_DIR
except Exception:
    STORAGE_DIR = Path.cwd() / 'storage'
try:
    from core.app_info import USER_AGENT
except Exception:
    USER_AGENT='NexusLauncher/0.6.0'
logger=logging.getLogger(__name__)
IMAGE_CACHE_DIR=Path(STORAGE_DIR)/'image_cache'
_MAX_CACHE_FILES=1000
def _trim_image_cache():
    try:
        files=sorted(IMAGE_CACHE_DIR.iterdir(), key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True)
        if len(files)>_MAX_CACHE_FILES:
            for old in files[_MAX_CACHE_FILES:]:
                try: old.unlink()
                except Exception: pass
    except Exception:
        pass
def get_image_cache_path(url):
    IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True); return IMAGE_CACHE_DIR/(hashlib.sha1(str(url).encode()).hexdigest()+'.img')
class ImageDownloadThread(QThread):
    image_ready=Signal(bytes); image_failed=Signal(str)
    def __init__(self,url): super().__init__(); self.url=url
    def run(self):
        try:
            if not self.url: raise RuntimeError('empty url')
            p=get_image_cache_path(self.url)
            if p.exists() and p.stat().st_size>0:
                try:
                    self.image_ready.emit(p.read_bytes()); return
                except (OSError, PermissionError) as e:
                    logger.warning("Failed to read cached image: %s", e)
            r=requests.get(self.url,timeout=20,headers={'User-Agent':USER_AGENT}); r.raise_for_status()
            try:
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(r.content)
                _trim_image_cache()
            except (OSError, PermissionError) as e:
                logger.warning("Failed to write image cache: %s", e)
            self.image_ready.emit(r.content)
        except Exception as e: self.image_failed.emit(str(e))
class RemoteImageLabel(QLabel):
    def __init__(self,w,h,placeholder='◆'):
        super().__init__(); self.image_width=w; self.image_height=h; self.placeholder=placeholder; self.worker=None; self.setFixedSize(w,h); self.setAlignment(Qt.AlignCenter); self.setText(placeholder)
    def set_remote_image(self,url):
        if not url: self.setText(self.placeholder); return
        p=get_image_cache_path(url)
        if p.exists() and p.stat().st_size>0: self.apply_image_data(p.read_bytes()); return
        self.worker=ImageDownloadThread(url); self.worker.image_ready.connect(self.apply_image_data); self.worker.image_failed.connect(lambda e:self.setText(self.placeholder)); self.worker.finished.connect(self.worker.deleteLater); self.worker.start()
    def apply_image_data(self,data):
        pix=QPixmap(); pix.loadFromData(data)
        if pix.isNull(): self.setText(self.placeholder); return
        self.setPixmap(pix.scaled(self.image_width,self.image_height,Qt.KeepAspectRatioByExpanding,Qt.SmoothTransformation)); self.setText('')
