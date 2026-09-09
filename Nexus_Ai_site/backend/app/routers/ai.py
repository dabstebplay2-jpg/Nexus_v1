import json
import os

from fastapi import APIRouter, HTTPException

from app.agent import TOOLS, execute_tool, log_agent_action
from app.schemas import AIChatRequest
from app.tokens import cloud_request, get_local_tokens

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _cloud_detail(response) -> str:
    try:
        data = response.json()
        detail = data.get("detail")
        if isinstance(detail, str):
            return detail
    except Exception:
        pass
    text = (getattr(response, "text", None) or "").strip()
    return text[:500] if text else "Ошибка облачного сервера Nexus."


def _require_auth():
    access_token, _ = get_local_tokens()
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="Войдите в аккаунт (чат → О Nexus или личный кабинет).",
        )
    return access_token


@router.get("/models")
async def proxy_models():
    _require_auth()
    response = await cloud_request("GET", "/v1/ai/models")
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Сессия истекла. Войдите снова.")
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=_cloud_detail(response))
    return response.json()


@router.post("/models/refresh")
async def proxy_models_refresh():
    _require_auth()
    response = await cloud_request("POST", "/v1/ai/models/refresh", json_data={})
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=_cloud_detail(response))
    return response.json()


@router.get("/agents")
async def proxy_agents():
    _require_auth()
    response = await cloud_request("GET", "/v1/ai/agents")
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=_cloud_detail(response))
    return response.json()


@router.post("/chat/simple")
async def proxy_simple_chat(body: dict):
    _require_auth()
    response = await cloud_request("POST", "/v1/ai/chat/simple", json_data=body)
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Сессия истекла. Войдите снова.")
    if response.status_code in (402, 429):
        raise HTTPException(status_code=response.status_code, detail=_cloud_detail(response))
    if response.status_code == 403:
        detail = response.json().get("detail", "Доступ запрещён.")
        raise HTTPException(status_code=403, detail=detail)
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=_cloud_detail(response))
    return response.json()


@router.post("/research")
async def proxy_research(body: dict):
    _require_auth()
    response = await cloud_request("POST", "/v1/ai/research", json_data=body)
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Сессия истекла. Войдите снова.")
    if response.status_code in (402, 429):
        raise HTTPException(status_code=response.status_code, detail=_cloud_detail(response))
    if response.status_code == 403:
        detail = response.json().get("detail", "Доступ запрещён.")
        raise HTTPException(status_code=403, detail=detail)
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=_cloud_detail(response))
    return response.json()


@router.post("/chat")
async def ai_chat_proxy(req: AIChatRequest):
    access_token, _ = get_local_tokens()
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="Вы не авторизованы. Пожалуйста, войдите в свой аккаунт во вкладке Профиль.",
        )

    system_prompt = (
        "You are an advanced autonomous software engineering agent inside the Nexus Pro IDE.\n"
        "You have complete access to local tools that let you list directories, read files, write/edit files, run terminal commands, and open files in the editor tabs.\n"
        f"The current project workspace folder is located at: {req.workspace_path}\n\n"
        "INSTRUCTIONS:\n"
        "1. If the user asks you to write code, create files, edit files, list folders, or run scripts, USE your tools. Do not just write instructions — execute them directly!\n"
        "2. To modify an existing file, PREFER using the 'patch_file' tool. Only use 'write_file' if you are creating a new file from scratch.\n"
        "3. If you create or modify a file, use the 'open_file_in_editor' tool to automatically display it in the user's workspace.\n"
        "4. Keep track of what you execute, and summarize your actions clearly to the user."
    )

    rules_path = os.path.join(req.workspace_path, "NEXUSRULES.md")
    if os.path.exists(rules_path):
        try:
            with open(rules_path, "r", encoding="utf-8") as f:
                rules_content = f.read()
            system_prompt += f"\n\nIMPORTANT - Project Custom Rules (NEXUSRULES.md):\n```\n{rules_content}\n```"
        except Exception:
            pass

    messages = [{"role": "system", "content": system_prompt}]

    if req.directory_context:
        messages.append(
            {"role": "system", "content": f"Workspace directory tree reference:\n{req.directory_context}"}
        )
    if req.file_context:
        messages.append({"role": "system", "content": f"Active open file contents:\n{req.file_context}"})

    for msg in req.chat_history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": req.prompt})

    frontend_actions = []
    billing_info = None

    for _ in range(12):
        payload = {
            "model": req.model,
            "messages": messages,
            "tools": TOOLS,
            "tool_choice": "auto",
        }

        try:
            response = await cloud_request("POST", "/v1/ai/chat", json_data=payload)

            if response.status_code == 401:
                raise HTTPException(
                    status_code=401,
                    detail="Ваша сессия авторизации истекла. Пожалуйста, войдите в аккаунт заново во вкладке Профиль.",
                )
            if response.status_code in (402, 429):
                raise HTTPException(
                    status_code=response.status_code,
                    detail=_cloud_detail(response),
                )
            if response.status_code == 403:
                detail_msg = response.json().get("detail", "Доступ запрещен облаком.")
                raise HTTPException(status_code=403, detail=detail_msg)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=_cloud_detail(response),
                )

            data = response.json()
            choice = data["choices"][0]
            message = choice["message"]

            if "billing" in data:
                billing_info = data["billing"]
                log_agent_action(
                    req.model,
                    "Agent step processed successfully",
                    billing_info.get("deducted_usd", 0.0),
                )

            messages.append(message)

            tool_calls = message.get("tool_calls")
            if not tool_calls:
                return {
                    "status": "success",
                    "reply": message.get("content", ""),
                    "actions": frontend_actions,
                    "billing": billing_info,
                }

            for tool_call in tool_calls:
                tool_name = tool_call["function"]["name"]
                raw_args = tool_call["function"].get("arguments", "{}")

                try:
                    tool_args = json.loads(raw_args)
                except Exception:
                    tool_args = {}

                if tool_name == "open_file_in_editor":
                    rel_path = tool_args.get("path")
                    full_path = os.path.abspath(os.path.join(req.workspace_path, rel_path))
                    frontend_actions.append({"type": "open_file", "path": full_path})

                tool_result = await execute_tool(tool_name, tool_args, req.workspace_path)

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "name": tool_name,
                        "content": tool_result,
                    }
                )

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Agent loop error: {str(e)}")

    return {
        "status": "success",
        "reply": "I completed some operations, but reached my execution limit.",
        "actions": frontend_actions,
        "billing": billing_info,
    }
