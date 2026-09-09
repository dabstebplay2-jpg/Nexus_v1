"""Планировщик поиска обращается к тому же провайдеру, что и пользователь."""

from app.config import OPENROUTER_BASE_URL, POLZA_BASE_URL
from app.services.web_search_agent import _planner_chat_url


def test_polza_planner_url():
    url, is_openrouter = _planner_chat_url("pza_test")
    assert url == f"{POLZA_BASE_URL}/chat/completions"
    assert is_openrouter is False


def test_openrouter_planner_url():
    url, is_openrouter = _planner_chat_url("sk-or-v1-test")
    assert url == f"{OPENROUTER_BASE_URL}/chat/completions"
    assert is_openrouter is True
