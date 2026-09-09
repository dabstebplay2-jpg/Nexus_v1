"""Модель сама выбирает коннектор без загрязнения истории черновиком."""

import pytest

from app.database import UserDB
from app.services.connector_agent_loop import run_connector_agent_phase


@pytest.mark.asyncio
async def test_connector_probe_without_tool_keeps_messages(monkeypatch, db_session):
    monkeypatch.setattr(
        "app.services.connector_agent_loop.collect_tools_for_user",
        lambda _db, _uid: [{"type": "function", "function": {"name": "github_list_repos"}}],
    )
    monkeypatch.setattr(
        "app.services.connector_agent_loop.connected_connector_ids_for_user",
        lambda _db, _uid: ["github"],
    )

    async def no_tool_call(_payload, _user):
        return {"choices": [{"message": {"role": "assistant", "content": "Черновик"}}]}

    messages = [{"role": "user", "content": "Объясни рекурсию"}]
    original = [dict(item) for item in messages]
    events = [
        event
        async for event in run_connector_agent_phase(
            db_session,
            db_session.query(UserDB).filter(UserDB.id == 1).one(),
            model="tool-model",
            messages=messages,
            call_routerai=no_tool_call,
        )
    ]

    assert messages == original
    assert [event["type"] for event in events] == ["connector_status"]


@pytest.mark.asyncio
async def test_connector_tool_result_is_kept_but_final_draft_is_not(monkeypatch, db_session):
    monkeypatch.setattr(
        "app.services.connector_agent_loop.collect_tools_for_user",
        lambda _db, _uid: [{"type": "function", "function": {"name": "github_list_repos"}}],
    )
    monkeypatch.setattr(
        "app.services.connector_agent_loop.connected_connector_ids_for_user",
        lambda _db, _uid: ["github"],
    )

    async def execute(_db, _uid, _name, _args):
        return '[{"name":"nexus"}]'

    monkeypatch.setattr("app.services.connector_agent_loop.execute_tool_call", execute)
    calls = 0

    async def routed_call(_payload, _user):
        nonlocal calls
        calls += 1
        if calls == 1:
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call-1",
                                    "type": "function",
                                    "function": {"name": "github_list_repos", "arguments": "{}"},
                                }
                            ],
                        }
                    }
                ]
            }
        return {"choices": [{"message": {"role": "assistant", "content": "Черновик ответа"}}]}

    messages = [{"role": "user", "content": "Какие у меня репозитории?"}]
    events = [
        event
        async for event in run_connector_agent_phase(
            db_session,
            db_session.query(UserDB).filter(UserDB.id == 1).one(),
            model="tool-model",
            messages=messages,
            call_routerai=routed_call,
        )
    ]

    assert [event["type"] for event in events] == [
        "connector_status",
        "tool_start",
        "tool_end",
    ]
    assert messages[-1]["role"] == "tool"
    assert "nexus" in messages[-1]["content"]
    assert all(item.get("content") != "Черновик ответа" for item in messages)
