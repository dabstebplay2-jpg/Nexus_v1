import pytest

from nexus import version
from nexus.version import CODENAME, VERSION


def test_version_string():
    assert VERSION == "5.0.0-beta"


def test_codename():
    assert CODENAME == "Ultimate AI OS"


def test_version_module_export():
    assert version.__version__ == VERSION
