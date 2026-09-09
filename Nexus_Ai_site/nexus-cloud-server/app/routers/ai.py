import asyncio
import json
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import agents_catalog, models_catalog
from app.config import (
    NEXUS_FREE_OPENROUTER_DAILY_LIMIT,
    NEXUS_FREE_OPENROUTER_RPM,
    OPENROUTER_BASE_URL,
    POLZA_BASE_URL,
    is_testing_mode,
    openrouter_free_tier_enabled,
)
from app.database import UserDB, get_db
from app.schemas import BrowserSearchRequest, CloudChatRequest, ResearchRequest, SimpleChatRequest
from app.security import get_current_user
from app.services.ai_billing import apply_usage_billing
from app.services.auth_rate_limit import check_rate_limit
from app.services.auto_tool_router import route_explicit_tools
from app.services.connector_agent_loop import run_connector_agent_phase
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.services.image_materialize import materialize_image_list, materialize_image_url
from app.services.memory_auto_learn import (
    last_user_message_text,
    schedule_learn_from_turn,
    should_update_memory_from_user_text,
)
from app.services.message_builder import (
    build_router_payload,
    extract_message_images,
)
from app.services.models_registry import tier_rank
from app.services.openrouter import OpenRouterError, OpenRouterService
from app.services.openrouter_provision import (
    ensure_openrouter_key_for_user,
    user_has_openrouter_key,
)
from app.services.polza import (
    PolzaError,
    PolzaService,
    require_inference_api_key,
    user_has_polza_key,
)
from app.services.pre_search_reasoning import iter_pre_search_reasoning
from app.services.quota_limits import QuotaLimitExceeded, assert_quota_budget
from app.services.subscription_guard import enforce_paid_subscription
from app.services.user_memory import get_enabled_memory_text, inject_user_memory_messages
from app.services.web_search_agent import run_web_search_session
from app.services.web_search_context import (
    DEEP_RESEARCH_DEFAULT_MODEL,
    build_web_search_system_content,
    run_web_search_for_chat,
    web_search_quick,
)
from app.services.web_search_gate import resolve_web_search_need
from app.tiers import tier_allows_ai, tier_requires_payment, tier_uses_openrouter_free

router = APIRouter(prefix="/v1/ai", tags=["ai"])
logger = logging.getLogger(__name__)

_polza = PolzaService()
_openrouter = OpenRouterService()
POLZA_CHAT_URL = f"{POLZA_BASE_URL.rstrip('/')}/chat/completions"
OPENROUTER_CHAT_URL = f"{OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"


def _user_on_free_openrouter(user: UserDB) -> bool:
    return tier_uses_openrouter_free(user.subscription_tier)


def _check_free_rate_limits(user: UserDB) -> None:
    uid = user.id
    if not check_rate_limit(f"free_ai:rpm:user:{uid}", NEXUS_FREE_OPENROUTER_RPM, 60.0):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Лимит Free: слишком много запросов в минуту. Оформите Hobby для большего лимита.",
        )
    if not check_rate_limit(
        f"free_ai:day:user:{uid}", NEXUS_FREE_OPENROUTER_DAILY_LIMIT, 86400.0
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Дневной лимит Free исчерпан. Оформите тариф Hobby или выше.",
        )


def _sse_event(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _check_tier_ai_access(user: UserDB, db: Session):
    if _user_on_free_openrouter(user):
        if not openrouter_free_tier_enabled():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Бесплатный ИИ временно недоступен. Оформите тариф Hobby или выше.",
            )
        _check_free_rate_limits(user)
        return
    if not await enforce_paid_subscription(db, user, trigger="ai_chat"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Подписка не оплачена. Оформите и оплатите тариф Hobby или выше.",
        )
    db.refresh(user)
    tier = user.subscription_tier
    if not tier_requires_payment(tier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ИИ доступен только после оплаты подписки (Hobby и выше). Free — без облачного ИИ.",
        )
    if not user_has_polza_key(user):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ключ облачного ИИ выдаётся после оплаты тарифа. Подождите минуту или нажмите «Восстановить ключ» в настройках.",
        )


def _check_quota_limit(db: Session, user: UserDB):
    if _user_on_free_openrouter(user):
        return
    try:
        assert_quota_budget(db, user, projected_cost=0)
    except QuotaLimitExceeded as exc:
        info = exc.info
        rate = get_usd_rub_rate_sync()
        if info.get("abuse_daily_cap_usd"):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Слишком высокий расход за сутки. Подождите до завтра (UTC) "
                    "или пополните баланс в разделе «Тарифы»."
                ),
            ) from exc
        end = info.get("resets_at") or info.get("period_end") or ""
        balance_usd = float(info.get("user_balance_usd") or 0)
        if info.get("period_expired") or info.get("renewal_required"):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Период подписки закончился{f' ({end})' if end else ''}. "
                    "Продлите тариф в разделе «Тарифы»"
                    f"{'' if balance_usd <= 0 else f' или используйте баланс пополнения ({usd_to_rub(balance_usd, rate):.0f} ₽).'}"
                ),
            ) from exc
        if balance_usd <= 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Месячный пул ИИ исчерпан: {usd_to_rub(info['spent_usd'], rate):.0f} ₽ из "
                    f"{usd_to_rub(info.get('subscription_cap_usd') or info['cap_usd'], rate):.0f} ₽. "
                    f"Пополните баланс в разделе «Тарифы»"
                    f"{f' или продлите подписку до {end}.' if end else '.'}"
                ),
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Пул ИИ исчерпан. Остаток на балансе пополнения: "
                f"{usd_to_rub(balance_usd, rate):.0f} ₽."
            ),
        ) from exc


async def _apply_billing_safe(db: Session, user: UserDB, *, model: str, usage: dict | None):
    try:
        return await apply_usage_billing(db, user, model=model, usage=usage)
    except QuotaLimitExceeded as exc:
        info = exc.info
        rate = get_usd_rub_rate_sync()
        balance_usd = float(info.get("user_balance_usd") or 0)
        if info["remaining_usd"] <= 0 and balance_usd <= 0:
            detail = (
                "Пул ИИ исчерпан. Пополните баланс в разделе «Тарифы»."
            )
        else:
            detail = (
                f"Недостаточно лимита: осталось {usd_to_rub(info['remaining_usd'], rate):.0f} ₽ "
                f"(подписка + баланс)."
            )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
        ) from exc


async def _check_model_access(user: UserDB, model: str, *, allow_tools: bool = False):
    model_id = (model or "").strip()
    if not model_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не указана модель.",
        )
    if not is_testing_mode() and not tier_allows_ai(user.subscription_tier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Облачный ИИ недоступен на вашем тарифе. Выберите тариф в разделе «О Nexus».",
        )
    detail = await models_catalog.model_access_detail_cached(user.subscription_tier, model_id)
    if detail.get("reason") == "unknown_model":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail.get("upgrade_hint") or "Модель не входит в каталог Nexus.",
        )
    if not detail.get("allowed"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail.get("upgrade_hint") or "Модель недоступна на вашем тарифе.",
        )
    if allow_tools and _user_on_free_openrouter(user):
        from app.services.openrouter_models import get_free_model

        m = get_free_model(model_id)
        if not m or not m.get("supports_tools"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Инструменты недоступны для выбранной бесплатной модели.",
            )


async def _require_chat_api_key(user: UserDB, db: Session) -> str:
    if _user_on_free_openrouter(user):
        try:
            return await ensure_openrouter_key_for_user(user, db)
        except OpenRouterError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)
            ) from e
    try:
        return require_inference_api_key(user)
    except PolzaError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e


def _with_openrouter_user(payload: dict, user: UserDB) -> dict:
    if not _user_on_free_openrouter(user):
        return payload
    body = dict(payload)
    body["user"] = str(user.id)
    return body


async def _call_openrouter(payload: dict, user: UserDB, db: Session) -> dict:
    try:
        api_key = await _require_chat_api_key(user, db)
    except OpenRouterError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    body = _with_openrouter_user(payload, user)
    try:
        response = await _openrouter.chat_completions(body, timeout=120.0, api_key=api_key)
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ошибка соединения с OpenRouter: {e}",
        ) from e

    if response.status_code in (401, 403) and user_has_openrouter_key(user):
        logger.warning("OpenRouter key for user %s returned %s. Reprovisioning key...", user.id, response.status_code)
        try:
            from app.services.openrouter_provision import delete_openrouter_key_for_user
            await delete_openrouter_key_for_user(user, db)
            db.refresh(user)
            api_key = await ensure_openrouter_key_for_user(user, db)
            response = await _openrouter.chat_completions(body, timeout=120.0, api_key=api_key)
        except Exception as exc:
            logger.error("Failed to reprovision OpenRouter key for user %s on 401/403: %s", user.id, exc)

    if response.status_code == 200:
        return response.json()
    code = response.status_code
    if code == 429:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Лимит OpenRouter для бесплатных моделей. Попробуйте позже или оформите Hobby.",
        )
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"ИИ-провайдер OpenRouter ({code}): {response.text[:500]}",
    )


async def _call_inference(payload: dict, user: UserDB, db: Session | None = None) -> dict:
    if _user_on_free_openrouter(user):
        if db is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="DB session required for OpenRouter inference.",
            )
        return await _call_openrouter(payload, user, db)
    return await _call_polza(payload, user, db)


async def _call_polza(payload: dict, user: UserDB, db: Session | None = None) -> dict:
    del db  # Polza OAuth keys — без auto-repair
    try:
        api_key = require_inference_api_key(user)
    except PolzaError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e

    try:
        response = await _polza.chat_completions(api_key, payload, timeout=120.0)
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ошибка соединения с Polza.ai: {e}",
        ) from e
    if response.status_code == 200:
        return response.json()

    code = response.status_code
    if code == 402:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Недостаточно средств на Polza.ai. Пополните баланс на polza.ai/dashboard.",
        )
    if code in (401, 403):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Ошибка личного ключа Polza.ai. Переподключите в настройках → «Подключить Polza.ai». "
                f"({response.text[:300]})"
            ),
        )
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"ИИ-провайдер Polza ({code}): {response.text[:500]}",
    )


async def _resolve_simple_chat_model(payload: SimpleChatRequest, user: UserDB) -> str:
    model = payload.model
    if payload.agent_id:
        agent = agents_catalog.get_agent(payload.agent_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неизвестный агент.")
        if tier_rank(user.subscription_tier) < tier_rank(agent.get("min_tier", "ULTRA")):
            label = agent.get("min_tier", "ULTRA").title()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Агент «{agent.get('name', payload.agent_id)}» доступен с тарифа {label}.",
            )
        if not model:
            model = await models_catalog.get_default_model(
                user.subscription_tier, prefer=agent.get("model_preference", "balanced")
            )
    if not model:
        model = await models_catalog.get_default_model(user.subscription_tier)
    await _check_model_access(user, model)
    return model


def _is_image_generation_model(model_id: str) -> bool:
    meta = models_catalog.get_model(model_id) or {}
    if meta.get("media_type") == "video":
        return False
    return bool(meta.get("category") == "media" or meta.get("supports_image_gen"))


async def _default_image_generation_model(
    subscription_tier: str,
    *,
    preferred: str | None = None,
) -> str | None:
    models = await models_catalog.list_media_models_for_user(subscription_tier)
    usable = [
        item
        for item in models
        if not item.get("locked")
        and item.get("media_type") != "video"
        and (item.get("category") == "media" or item.get("supports_image_gen"))
    ]
    if preferred:
        match = next((item for item in usable if item.get("id") == preferred), None)
        if match:
            return str(match["id"])
    preferred_ids = (
        "google/gemini-3.1-flash-lite-image",
        "google/gemini-2.5-flash-image",
        "openai/gpt-5-image-mini",
    )
    for model_id in preferred_ids:
        match = next((item for item in usable if item.get("id") == model_id), None)
        if match:
            return model_id
    return str(usable[0]["id"]) if usable else None


async def _resolve_simple_chat_route(
    payload: SimpleChatRequest,
    user: UserDB,
) -> tuple[str, str | None]:
    """Выбирает модель и встроенный инструмент до построения запроса провайдеру."""
    requested = (payload.model or "").strip()
    if requested and _is_image_generation_model(requested):
        await _check_model_access(user, requested)
        return requested, "image_generation"

    user_text = last_user_message_text(payload.messages)
    explicit = route_explicit_tools(user_text)
    if explicit.image_generation:
        image_model = await _default_image_generation_model(
            user.subscription_tier,
            preferred=payload.preferred_image_model,
        )
        if not image_model:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="На вашем тарифе сейчас нет доступной модели генерации изображений.",
            )
        await _check_model_access(user, image_model)
        return image_model, "image_generation"

    return await _resolve_simple_chat_model(payload, user), None


def _supports_tool_calls(model: dict | None) -> bool:
    if not model:
        return False
    params = set(model.get("supported_parameters") or [])
    return bool(model.get("supports_tools") or {"tools", "tool_choice"} & params)


async def _connector_tool_model(current_model: str, subscription_tier: str) -> str:
    current_meta = models_catalog.get_model(current_model)
    if _supports_tool_calls(current_meta):
        return current_model
    models = await models_catalog.list_usable_models_for_user(subscription_tier)
    capable = [item for item in models if _supports_tool_calls(item)]
    if not capable:
        return current_model
    capable.sort(
        key=lambda item: (
            float(item.get("price_1m_usd") or 0),
            -int(item.get("quality_score") or 0),
        )
    )
    return str(capable[0]["id"])


def _collect_images_from_part(part: dict, seen_urls: set[str], out: list[dict[str, str]]):
    for img in extract_message_images(part):
        url = img.get("url")
        if url and url not in seen_urls:
            seen_urls.add(url)
            out.append({"url": url})


def _coerce_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(
                    str(item.get("text") or item.get("content") or item.get("thinking") or "")
                )
        return "".join(parts)
    if isinstance(value, dict):
        return str(value.get("text") or value.get("content") or "")
    return str(value)


def _reasoning_from_details(details) -> str:
    """GPT-5.x / OpenRouter: reasoning в delta.reasoning_details[]."""
    if not details:
        return ""
    if isinstance(details, str):
        return details
    if isinstance(details, dict):
        return str(
            details.get("text")
            or details.get("content")
            or details.get("summary")
            or ""
        )
    if not isinstance(details, list):
        return ""
    parts: list[str] = []
    for item in details:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict):
            t = item.get("text") or item.get("content") or item.get("summary")
            if t:
                parts.append(str(t))
    return "".join(parts)


def _stream_text_parts(delta: dict, message: dict, choice: dict | None = None) -> tuple[str, str]:
    """(thinking_fragment, answer_fragment) из OpenAI-совместимого chunk."""
    ch = choice or {}
    thinking = _coerce_text(
        delta.get("reasoning_content")
        or delta.get("reasoning")
        or message.get("reasoning_content")
        or message.get("reasoning")
    )
    if not thinking:
        thinking = _reasoning_from_details(delta.get("reasoning_details")) or _reasoning_from_details(
            message.get("reasoning_details")
        )
    content = _coerce_text(
        delta.get("content")
        or delta.get("text")
        or message.get("content")
        or message.get("text")
        or ch.get("text")
    )
    return thinking, content


async def _stream_chat_tokens(
    chat_url: str,
    api_key: str,
    payload: dict,
    *,
    provider_label: str,
    auth_error_detail: str,
):
    """Прокси SSE OpenAI-compatible API → клиент Nexus."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if chat_url.startswith(OPENROUTER_BASE_URL):
        headers.update(_openrouter._headers(api_key))
    usage: dict | None = None
    collected_images: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    reply_parts: list[str] = []
    had_thinking = False
    had_tokens = False
    timeout = httpx.Timeout(180.0, read=180.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            chat_url,
            headers=headers,
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = (await response.aread()).decode("utf-8", errors="replace")[:500]
                code = response.status_code
                if code in (401, 403):
                    yield _sse_event(
                        {"type": "error", "detail": auth_error_detail, "auth_failure": True}
                    )
                    return
                if code == 429:
                    yield _sse_event(
                        {
                            "type": "error",
                            "detail": "Лимит OpenRouter для бесплатных моделей. Попробуйте позже или оформите Hobby.",
                        }
                    )
                    return
                detail = f"ИИ-провайдер {provider_label} ({code}): {body}"
                yield _sse_event({"type": "error", "detail": detail})
                return

            async for line in response.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if raw == "[DONE]":
                    break
                try:
                    chunk = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if chunk.get("usage"):
                    usage = chunk["usage"]
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                choice = choices[0]
                delta = choice.get("delta") or {}
                message = choice.get("message") or {}
                thinking_text, answer_text = _stream_text_parts(delta, message, choice)
                if thinking_text:
                    had_thinking = True
                    yield _sse_event({"type": "thinking", "content": thinking_text})
                if answer_text:
                    had_tokens = True
                    reply_parts.append(answer_text)
                    yield _sse_event({"type": "token", "content": answer_text})
                before = len(collected_images)
                _collect_images_from_part(delta, seen_urls, collected_images)
                _collect_images_from_part(message, seen_urls, collected_images)
                for i in range(before, len(collected_images)):
                    mat = await materialize_image_url(collected_images[i]["url"])
                    collected_images[i] = mat
                    evt = {"type": "image", "url": mat["url"]}
                    if mat.get("dataUrl"):
                        evt["dataUrl"] = mat["dataUrl"]
                    yield _sse_event(evt)

    if collected_images:
        collected_images = await materialize_image_list(collected_images)

    yield {
        "usage": usage,
        "images": collected_images,
        "had_thinking": had_thinking,
        "had_tokens": had_tokens,
        "reply_text": "".join(reply_parts),
    }


async def _stream_polza_tokens(
    api_key: str,
    payload: dict,
    user: UserDB | None = None,
    db: Session | None = None,
):
    async for item in _stream_chat_tokens(
        POLZA_CHAT_URL,
        api_key,
        payload,
        provider_label="Polza",
        auth_error_detail=(
            "Ошибка личного ключа Polza.ai. Перезайдите в аккаунт или обратитесь в поддержку."
        ),
    ):
        yield item


async def _stream_openrouter_tokens(
    api_key: str,
    payload: dict,
    user: UserDB | None = None,
    db: Session | None = None,
):
    current_key = api_key
    first_try = True

    while True:
        auth_failure_detected = False
        async for item in _stream_chat_tokens(
            OPENROUTER_CHAT_URL,
            current_key,
            payload,
            provider_label="OpenRouter",
            auth_error_detail="Ошибка доступа к бесплатным моделям OpenRouter.",
        ):
            if isinstance(item, str) and '"auth_failure": true' in item:
                auth_failure_detected = True
                continue
            yield item

        if auth_failure_detected and first_try and user and db:
            if user_has_openrouter_key(user):
                logger.warning(
                    "OpenRouter stream returned 401/403 for user %s. Reprovisioning key...",
                    user.id,
                )
                try:
                    from app.services.openrouter_provision import (
                        delete_openrouter_key_for_user,
                    )

                    await delete_openrouter_key_for_user(user, db)
                    db.refresh(user)
                    current_key = await ensure_openrouter_key_for_user(user, db)
                    first_try = False
                    continue
                except Exception as exc:
                    logger.error(
                        "Failed to reprovision key on stream auth failure for user %s: %s",
                        user.id,
                        exc,
                    )

        break


def _stream_fn_for_user(user: UserDB):
    if _user_on_free_openrouter(user):
        return _stream_openrouter_tokens
    return _stream_polza_tokens


async def _apply_billing_for_user(
    db: Session, user: UserDB, *, model: str, usage: dict | None
):
    if _user_on_free_openrouter(user):
        return None
    return await _apply_billing_safe(db, user, model=model, usage=usage)


@router.get("/models")
async def list_models(current_user: UserDB = Depends(get_current_user)):
    tier = current_user.subscription_tier
    models = await models_catalog.list_models_for_user(tier)
    research_models = await models_catalog.list_research_models_for_user(tier)
    media_models = await models_catalog.list_media_models_for_user(tier)
    meta = await models_catalog.catalog_meta()
    vision_guide = await models_catalog.vision_guide_for_user(tier)
    return {
        "models": models,
        "research_models": research_models,
        "media_models": media_models,
        "vision_guide": vision_guide,
        "tier": tier,
        "ai_enabled": tier_allows_ai(tier),
        "catalog": meta,
    }


@router.post("/models/refresh")
async def refresh_models(current_user: UserDB = Depends(get_current_user)):
    if not check_rate_limit(f"models_refresh:user:{current_user.id}", 3, 3600.0):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Обновление каталога моделей доступно не чаще 3 раз в час.",
        )
    from app.services import models_registry as reg

    await reg.refresh_all_model_sources(force=True)
    models = await models_catalog.list_models_for_user(current_user.subscription_tier)
    meta = await models_catalog.catalog_meta()
    return {"models": models, "catalog": meta}


@router.get("/agents")
async def list_agents(current_user: UserDB = Depends(get_current_user)):
    agents = await agents_catalog.list_agents_for_user(current_user.subscription_tier)
    return {"agents": agents, "tier": current_user.subscription_tier}


@router.post("/chat")
async def cloud_ai_chat_proxy(
    payload: CloudChatRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await _check_tier_ai_access(current_user, db)
    _check_quota_limit(db, current_user)
    await _check_model_access(current_user, payload.model, allow_tools=bool(payload.tools))

    proxy_payload = {
        "model": payload.model,
        "messages": [m.model_dump() for m in payload.messages],
    }
    if payload.tools:
        proxy_payload["tools"] = payload.tools
    if payload.tool_choice:
        proxy_payload["tool_choice"] = payload.tool_choice

    data = await _call_inference(proxy_payload, current_user, db)
    billing = await _apply_billing_for_user(
        db, current_user, model=payload.model, usage=data.get("usage")
    )
    if billing:
        data["billing"] = billing
    return data


@router.post("/chat/simple")
async def simple_chat(
    payload: SimpleChatRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await _check_tier_ai_access(current_user, db)
    _check_quota_limit(db, current_user)
    model, routed_tool = await _resolve_simple_chat_route(payload, current_user)

    memory_text = get_enabled_memory_text(db, current_user.id)
    router_body = build_router_payload(model, payload, memory_content=memory_text)
    data = await _call_inference(router_body, current_user, db)
    choice = data.get("choices", [{}])[0]
    message = choice.get("message", {})
    billing = await _apply_billing_for_user(db, current_user, model=model, usage=data.get("usage"))
    reply_images = await materialize_image_list(extract_message_images(message))
    reply_text = message.get("content", "") or ""
    user_text = last_user_message_text(payload.messages)
    if should_update_memory_from_user_text(user_text):
        schedule_learn_from_turn(current_user.id, user_text, reply_text)
    return {
        "reply": reply_text,
        "images": reply_images,
        "model": model,
        "billing": billing,
        "tools_used": [routed_tool] if routed_tool else [],
    }


@router.post("/chat/simple/stream")
async def simple_chat_stream(
    payload: SimpleChatRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await _check_tier_ai_access(current_user, db)
    _check_quota_limit(db, current_user)
    model, routed_tool = await _resolve_simple_chat_route(payload, current_user)
    memory_text = get_enabled_memory_text(db, current_user.id)
    router_body = build_router_payload(model, payload, memory_content=memory_text)
    web_preference = bool(payload.auto_tools or payload.use_web_search)

    api_key = await _require_chat_api_key(current_user, db)
    stream_tokens = _stream_fn_for_user(current_user)

    user_text = last_user_message_text(payload.messages)
    if routed_tool == "image_generation":
        use_web = False
        search_reason = "image_generation"
    else:
        search_decision = await resolve_web_search_need(
            user_text,
            preference_enabled=web_preference,
            api_key=api_key,
            subscription_tier=current_user.subscription_tier or "STANDARD",
        )
        use_web = search_decision.should_search
        search_reason = search_decision.reason
    search_skipped = web_preference and not use_web and routed_tool is None
    search_skip_reason = search_reason if search_skipped else ""
    if web_preference or use_web:
        logger.info(
            "web search gate: preference=%s use_web=%s reason=%s",
            web_preference,
            use_web,
            search_reason,
        )

    user_id = current_user.id

    async def event_generator():
        import time as _time

        nonlocal api_key

        stream_sources: list[dict] = []
        stream_engine = ""
        used_tools: list[str] = []
        body = dict(router_body)
        if routed_tool == "image_generation":
            used_tools.append("image_generation")
            yield _sse_event({"type": "status", "content": "image_generation"})
        if search_skipped:
            yield _sse_event(
                {
                    "type": "status",
                    "content": "search_skipped",
                    "reason": search_skip_reason,
                }
            )
        if use_web:
            used_tools.append("web_search")
            pre_search_reasoning = ""
            yield _sse_event({"type": "status", "content": "planning"})
            try:
                async for sse_line, delta in iter_pre_search_reasoning(
                    stream_tokens, api_key, body
                ):
                    if sse_line:
                        yield sse_line
                        if delta:
                            pre_search_reasoning += delta
                pre_search_reasoning = pre_search_reasoning.strip()[:1200]
                if pre_search_reasoning:
                    yield _sse_event(
                        {
                            "type": "pre_search_done",
                            "chars": len(pre_search_reasoning),
                        }
                    )
            except Exception as exc:
                logger.warning("pre-search reasoning failed: %s", exc)

            yield _sse_event({"type": "status", "content": "searching"})
            progress_q: asyncio.Queue = asyncio.Queue()

            async def _on_progress(evt: dict) -> None:
                await progress_q.put(evt)

            tier = current_user.subscription_tier
            search_task = asyncio.create_task(
                run_web_search_for_chat(
                    payload,
                    body["messages"],
                    api_key=api_key,
                    subscription_tier=tier,
                    deep=False,
                    search_depth=payload.web_search_depth,
                    pre_search_reasoning=pre_search_reasoning,
                    on_progress=_on_progress,
                )
            )
            try:
                _last_sse = _time.monotonic()
                while True:
                    if search_task.done() and progress_q.empty():
                        break
                    try:
                        evt = await asyncio.wait_for(progress_q.get(), timeout=0.15)
                        yield _sse_event(evt)
                        _last_sse = _time.monotonic()
                    except asyncio.TimeoutError:
                        if _time.monotonic() - _last_sse >= 8.0:
                            yield ": keepalive\n\n"
                            _last_sse = _time.monotonic()
                        if search_task.done():
                            continue
                body["messages"], stream_sources, stream_engine, _meta = await search_task
                while not progress_q.empty():
                    yield _sse_event(progress_q.get_nowait())
            except Exception as exc:
                logger.warning("web search agent failed: %s", exc)
                if not search_task.done():
                    search_task.cancel()
                yield _sse_event({"type": "status", "content": "search_failed"})
            else:
                yield _sse_event(
                    {
                        "type": "status",
                        "content": "search_ready",
                        "sources_count": len(stream_sources),
                    }
                )

        if payload.auto_tools and payload.use_connectors and routed_tool != "image_generation":
            user_for_conn = db.query(UserDB).filter(UserDB.id == user_id).first()
            if user_for_conn:
                body_messages = body.get("messages") or []
                try:
                    connector_model = await _connector_tool_model(
                        model,
                        user_for_conn.subscription_tier,
                    )
                    async for conn_evt in run_connector_agent_phase(
                        db,
                        user_for_conn,
                        model=connector_model,
                        messages=body_messages,
                        call_routerai=lambda p, u: _call_inference(p, u, db),
                    ):
                        if conn_evt.get("type") == "tool_start":
                            tool_name = str(conn_evt.get("tool") or "connector")
                            if tool_name not in used_tools:
                                used_tools.append(tool_name)
                        yield _sse_event(conn_evt)
                    body["messages"] = body_messages
                except Exception as exc:
                    logger.warning("connector agent phase failed: %s", exc)
                    yield _sse_event({"type": "status", "content": "connectors_failed"})

        usage = None
        reply_images: list[dict] = []
        stream_reply_text = ""
        had_thinking = False
        had_tokens = False
        router_payload = _with_openrouter_user(
            {
                **body,
                "stream": True,
                "stream_options": {"include_usage": True},
            },
            current_user,
        )
        try:
            async for item in stream_tokens(api_key, router_payload, user=current_user, db=db):
                if isinstance(item, dict):
                    usage = item.get("usage")
                    reply_images = item.get("images") or []
                    had_thinking = bool(item.get("had_thinking"))
                    had_tokens = bool(item.get("had_tokens"))
                    stream_reply_text = str(item.get("reply_text") or stream_reply_text)
                else:
                    yield item
        except httpx.HTTPError as exc:
            logger.warning("stream httpx error: %s", exc)
            provider = "OpenRouter" if _user_on_free_openrouter(current_user) else "Polza.ai"
            yield _sse_event(
                {"type": "error", "detail": f"Ошибка соединения с {provider}: {exc}"}
            )
            return

        user = db.query(UserDB).filter(UserDB.id == user_id).first()
        if not user:
            yield _sse_event({"type": "error", "detail": "Сессия пользователя устарела."})
            return
        try:
            billing = await _apply_billing_for_user(db, user, model=model, usage=usage)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            yield _sse_event({"type": "error", "detail": detail})
            return
        done_payload: dict = {
            "type": "done",
            "model": model,
            "billing": billing,
            "images": reply_images,
            "had_thinking": had_thinking,
            "had_tokens": had_tokens or bool(reply_images),
            "tools_used": used_tools,
        }
        if stream_sources:
            done_payload["sources"] = stream_sources
            done_payload["search_engine"] = stream_engine
        if use_web:
            done_payload["search_depth"] = payload.web_search_depth
        user_text = last_user_message_text(payload.messages)
        if should_update_memory_from_user_text(user_text):
            schedule_learn_from_turn(user_id, user_text, stream_reply_text)
        yield _sse_event(done_payload)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/research")
async def research_chat(
    payload: ResearchRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await _check_tier_ai_access(current_user, db)
    _check_quota_limit(db, current_user)
    depth = (payload.depth or "deep").strip().lower()
    if payload.model:
        model = payload.model
    elif depth == "deep":
        try:
            await _check_model_access(current_user, DEEP_RESEARCH_DEFAULT_MODEL)
            model = DEEP_RESEARCH_DEFAULT_MODEL
        except HTTPException:
            model = await models_catalog.get_default_model(
                current_user.subscription_tier, prefer="premium"
            )
    else:
        model = await models_catalog.get_default_model(
            current_user.subscription_tier, prefer="premium"
        )
    await _check_model_access(current_user, model)

    api_key = await _require_chat_api_key(current_user, db)

    if depth == "deep":
        from app.config import WEB_SEARCH_DEEP_MAX_SOURCES

        all_sources, prompt_sources, engine, meta = await run_web_search_session(
            payload.query,
            api_key=api_key,
            subscription_tier=current_user.subscription_tier,
            max_sources=WEB_SEARCH_DEEP_MAX_SOURCES,
        )
        results = all_sources
        system = build_web_search_system_content(
            prompt_sources,
            engine or "none",
            deep=True,
            search_failed=not results,
            meta=meta,
            for_thinking=True,
        )
    else:
        results, engine = await web_search_quick(payload.query, limit=5)
        system = build_web_search_system_content(
            results,
            engine or "none",
            deep=False,
            search_failed=not results,
        )
    memory_text = get_enabled_memory_text(db, current_user.id)
    messages = [{"role": "system", "content": system}]
    if payload.messages:
        messages.extend([m.model_dump() for m in payload.messages])
    messages.append({"role": "user", "content": payload.query})
    messages = inject_user_memory_messages(messages, memory_text)

    data = await _call_inference({"model": model, "messages": messages}, current_user, db)
    choice = data.get("choices", [{}])[0]
    reply = choice.get("message", {}).get("content", "")
    billing = await _apply_billing_for_user(db, current_user, model=model, usage=data.get("usage"))
    return {
        "reply": reply,
        "model": model,
        "sources": results,
        "search_engine": engine,
        "billing": billing,
    }


@router.post("/browser/search")
async def browser_omnibox_search(
    payload: BrowserSearchRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search-first omnibox: web search + short AI answer."""
    await _check_tier_ai_access(current_user, db)
    _check_quota_limit(db, current_user)
    query = (payload.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Пустой запрос")
    depth = (payload.depth or "quick").strip().lower()
    model = await models_catalog.get_default_model(
        current_user.subscription_tier, prefer="cheap" if depth == "quick" else "premium"
    )
    await _check_model_access(current_user, model)
    api_key = await _require_chat_api_key(current_user, db)
    if depth == "deep":
        results, prompt_sources, engine, meta = await run_web_search_session(
            query,
            api_key=api_key,
            subscription_tier=current_user.subscription_tier,
            depth="standard",
        )
        system = build_web_search_system_content(
            prompt_sources,
            engine or "none",
            deep=False,
            search_failed=not results,
            meta=meta,
        )
    else:
        results, engine = await web_search_quick(query, limit=5)
        system = build_web_search_system_content(
            results,
            engine or "none",
            deep=False,
            search_failed=not results,
        )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": query},
    ]
    data = await _call_inference({"model": model, "messages": messages}, current_user, db)
    choice = data.get("choices", [{}])[0]
    reply = choice.get("message", {}).get("content", "")
    billing = await _apply_billing_for_user(db, current_user, model=model, usage=data.get("usage"))
    return {
        "reply": reply,
        "model": model,
        "sources": results,
        "search_engine": engine,
        "billing": billing,
    }


@router.post("/browser/context-chat")
async def browser_context_chat(
    payload: SimpleChatRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Page-aware chat from Nexus Browser."""
    return await simple_chat(payload, current_user, db)


@router.post("/browser/context-chat/stream")
async def browser_context_chat_stream(
    payload: SimpleChatRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Streaming page-aware chat from Nexus Browser."""
    return await simple_chat_stream(payload, current_user, db)


@router.post("/browser/agent/stream")
async def browser_agent_stream(
    payload: SimpleChatRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Browser agent: client runs tools locally; LLM orchestration via stream."""
    body = payload.model_copy(update={"browser_agent": True})
    return await simple_chat_stream(body, current_user, db)
