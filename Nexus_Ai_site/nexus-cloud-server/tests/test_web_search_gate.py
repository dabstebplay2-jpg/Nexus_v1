"""Тесты умного автопоиска (web_search_gate)."""

import pytest

from app.services.web_search_gate import (
    HeuristicClass,
    classify_web_search_heuristic,
    resolve_web_search_need,
)


@pytest.mark.parametrize(
    "text,expected",
    [
        ("привет", HeuristicClass.SKIP_GREETING),
        ("Hello!", HeuristicClass.SKIP_GREETING),
        ("что ты умеешь", HeuristicClass.SKIP_META),
        ("кто ты?", HeuristicClass.SKIP_META),
        ("сделай сайт", HeuristicClass.SKIP_CREATIVE),
        ("напиши код на python", HeuristicClass.SKIP_CREATIVE),
        ("найди в интернете курс доллара", HeuristicClass.EXPLICIT),
        ("поищи в сети новости ИИ", HeuristicClass.EXPLICIT),
        ("актуальный курс BTC", HeuristicClass.EXPLICIT),
        ("новости ИИ за неделю", HeuristicClass.LIKELY_FRESH),
        ("курс доллара сегодня", HeuristicClass.LIKELY_FRESH),
    ],
)
def test_classify_heuristic(text, expected):
    assert classify_web_search_heuristic(text) == expected


@pytest.mark.asyncio
async def test_explicit_search_when_preference_off():
    d = await resolve_web_search_need(
        "найди в интернете курс доллара",
        preference_enabled=False,
        api_key="",
    )
    assert d.should_search is True
    assert d.reason == "explicit"


@pytest.mark.asyncio
async def test_greeting_skipped_when_preference_on():
    d = await resolve_web_search_need(
        "привет",
        preference_enabled=True,
        api_key="",
    )
    assert d.should_search is False
    assert d.reason == "skip_greeting"


@pytest.mark.asyncio
async def test_meta_skipped_when_preference_on():
    d = await resolve_web_search_need(
        "что ты умеешь",
        preference_enabled=True,
        api_key="",
    )
    assert d.should_search is False
    assert d.reason == "skip_meta"


@pytest.mark.asyncio
async def test_creative_skipped_when_preference_on():
    d = await resolve_web_search_need(
        "можешь сделать сайт",
        preference_enabled=True,
        api_key="",
    )
    assert d.should_search is False
    assert d.reason == "skip_creative"


@pytest.mark.asyncio
async def test_freshness_when_preference_on():
    d = await resolve_web_search_need(
        "новости ИИ за неделю",
        preference_enabled=True,
        api_key="",
    )
    assert d.should_search is True
    assert d.reason == "likely_fresh"


@pytest.mark.asyncio
async def test_freshness_off_without_explicit():
    d = await resolve_web_search_need(
        "курс доллара сегодня",
        preference_enabled=False,
        api_key="",
    )
    assert d.should_search is False
    assert d.reason == "preference_off"


@pytest.mark.asyncio
async def test_preference_off_plain_chat():
    d = await resolve_web_search_need(
        "расскажи анекдот",
        preference_enabled=False,
        api_key="",
    )
    assert d.should_search is False


@pytest.mark.asyncio
async def test_uncertain_without_preference():
    d = await resolve_web_search_need(
        "объясни подробно теорию относительности Эйнштейна простыми словами",
        preference_enabled=False,
        api_key="",
    )
    assert d.should_search is False
    assert d.reason == "preference_off"
