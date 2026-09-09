"""Compatibility entry point: uvicorn main:app or uvicorn app.main:app"""

from app.main import app

__all__ = ["app"]
