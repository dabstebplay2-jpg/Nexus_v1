"""Обработчики Telegram-бота (aiogram 3)."""

from __future__ import annotations

import base64
import logging
import re

from aiogram import BaseMiddleware, Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    BufferedInputFile,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    TelegramObject,
)
from sqlalchemy.orm import Session

from app import models_catalog
from app.config import (
    NEXUS_FRONTEND_URL,
    TELEGRAM_MSG_RATE_LIMIT,
    TELEGRAM_MSG_RATE_WINDOW_SEC,
    TIER_POOL_FRACTION,
    TIER_PRICES,
    TIER_QUOTA_MARKETING,
    telegram_bot_enabled,
)
from app.database import UserDB
from app.services.auth_rate_limit import check_rate_limit_async
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.services.polza import user_has_polza_key
from app.services.quota_limits import get_quota_limit_info
from app.services.subscription_guard import user_has_active_paid_subscription
from app.services.telegram_auth import (
    build_site_login_url,
    display_user_label,
    find_or_create_telegram_user,
    issue_telegram_site_exchange,
)
from app.services.telegram_chat import TelegramChatError, run_telegram_chat
from app.services.telegram_link import (
    get_user_by_telegram_id,
    link_telegram_account,
)
from app.services.telegram_model_store import get_selected_model, set_selected_model
from app.tiers import normalize_tier, tier_requires_payment

logger = logging.getLogger(__name__)

tg_router = Router(name="nexus_telegram")

def _pricing_url() -> str:
    return f"{NEXUS_FRONTEND_URL.rstrip('/')}/pricing"


async def _rate_limit_message(telegram_id: int) -> bool:
    key = f"tg_msg:{telegram_id}"
    return await check_rate_limit_async(key, TELEGRAM_MSG_RATE_LIMIT, TELEGRAM_MSG_RATE_WINDOW_SEC)


def _linked_user(db: Session, message: Message) -> UserDB | None:
    if not message.from_user:
        return None
    return get_user_by_telegram_id(db, message.from_user.id)


async def _require_linked_user(message: Message, db: Session) -> UserDB | None:
    user = _linked_user(db, message)
    if user:
        return user
    await message.answer("Сначала нажмите /start — создадим аккаунт Nexus.")
    return None


def _site_login_keyboard(db: Session, user: UserDB) -> InlineKeyboardMarkup:
    exchange = issue_telegram_site_exchange(db, user)
    url = build_site_login_url(exchange)
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Открыть Nexus", url=url)]]
    )


async def _send_site_login(message: Message, db: Session, user: UserDB, lines: list[str]) -> None:
    await message.answer("\n".join(lines), reply_markup=_site_login_keyboard(db, user))


async def _send_images(message: Message, images: list[dict]) -> None:
    for img in images or []:
        data_url = img.get("dataUrl") or img.get("data_url")
        url = img.get("url") or ""
        try:
            if isinstance(data_url, str) and data_url.startswith("data:"):
                header, b64 = data_url.split(",", 1)
                mime = "image/jpeg"
                if ";" in header and ":" in header:
                    mime = header.split(":", 1)[1].split(";", 1)[0] or mime
                ext = "jpg" if "jpeg" in mime else "png"
                photo = BufferedInputFile(base64.b64decode(b64), filename=f"nexus.{ext}")
                await message.answer_photo(photo)
            elif url.startswith("http"):
                await message.answer_photo(url)
            elif url.startswith("data:"):
                header, b64 = url.split(",", 1)
                photo = BufferedInputFile(base64.b64decode(b64), filename="nexus.jpg")
                await message.answer_photo(photo)
        except Exception as exc:
            logger.warning("telegram sendPhoto failed: %s", exc)
            await message.answer("Не удалось отправить изображение. Попробуйте ещё раз.")


@tg_router.message(CommandStart())
async def cmd_start(message: Message, db: Session):
    args = (message.text or "").split(maxsplit=1)
    token = args[1].strip() if len(args) > 1 else ""

    if token:
        if not message.from_user:
            return
        try:
            user = link_telegram_account(
                db,
                token=token,
                telegram_id=message.from_user.id,
                telegram_username=message.from_user.username,
            )
            await _send_site_login(
                message,
                db,
                user,
                [
                    f"✅ Telegram привязан к {display_user_label(user)}.",
                    "",
                    "Напишите вопрос текстом или /balance — баланс.",
                    "/model — выбор модели, /image — картинка.",
                ],
            )
        except ValueError as exc:
            await message.answer(str(exc))
        return

    if not message.from_user:
        return

    user = _linked_user(db, message)
    if not user:
        try:
            user = await find_or_create_telegram_user(
                db,
                telegram_id=message.from_user.id,
                username=message.from_user.username,
                first_name=message.from_user.first_name,
            )
            await _send_site_login(
                message,
                db,
                user,
                [
                    "Добро пожаловать в Nexus!",
                    "",
                    "⚠️ Если у вас уже есть аккаунт на сайте (email/Google) —",
                    "не нажимайте «Открыть Nexus». Войдите на сайте и в",
                    "Настройках → «Подключить Telegram».",
                    "",
                    "Новый аккаунт через Telegram: кнопка «Открыть Nexus».",
                    "Оплата тарифа — на сайте (нужен email в настройках).",
                    "",
                    "В боте: чат с ИИ, /balance, /tariffs.",
                ],
            )
        except ValueError as exc:
            await message.answer(str(exc))
        return

    await _send_site_login(
        message,
        db,
        user,
        [
            f"Аккаунт: {display_user_label(user)}.",
            "Пишите сообщение — отвечу через ИИ.",
            "/balance · /profile · /tariffs · /model · /login — ссылка на сайт",
        ],
    )


@tg_router.message(Command("login"))
async def cmd_login(message: Message, db: Session):
    if not message.from_user:
        return
    if not await check_rate_limit_async(f"tg_login:{message.from_user.id}", 5, 3600.0):
        await message.answer("Слишком много запросов ссылки. Попробуйте через час.")
        return

    user = _linked_user(db, message)
    if not user:
        try:
            user = await find_or_create_telegram_user(
                db,
                telegram_id=message.from_user.id,
                username=message.from_user.username,
                first_name=message.from_user.first_name,
            )
        except ValueError as exc:
            await message.answer(str(exc))
            return

    from app.services.telegram_link import is_tg_shadow_email

    lines = [
        "Вход на сайт Nexus (ссылка одноразовая, ~2 мин):",
        f"{display_user_label(user)}",
    ]
    if is_tg_shadow_email(user.email):
        lines.extend(
            [
                "",
                "Уже есть аккаунт на сайте? Войдите по email на сайте,",
                "затем Настройки → «Подключить Telegram» — не /login.",
            ]
        )
    await _send_site_login(message, db, user, lines)


@tg_router.message(Command("balance"))
async def cmd_balance(message: Message, db: Session):
    user = await _require_linked_user(message, db)
    if not user:
        return

    quota = get_quota_limit_info(db, user)
    rate = get_usd_rub_rate_sync()
    sub_cap = float(quota.get("subscription_cap_usd") or quota["cap_usd"])
    sub_spent = float(quota.get("spent_usd") or 0)
    sub_rem = float(quota.get("subscription_remaining_usd") or 0)
    topup = float(quota.get("user_balance_usd") or user.balance or 0)
    total_rem = float(quota.get("remaining_usd") or 0)

    lines = [
        "💰 Баланс ИИ",
        f"Пул подписки: {usd_to_rub(sub_rem, rate):.0f} ₽ из {usd_to_rub(sub_cap, rate):.0f} ₽",
        f"Потрачено за период: {usd_to_rub(sub_spent, rate):.0f} ₽",
        f"Баланс пополнения: {usd_to_rub(topup, rate):.0f} ₽",
        f"Всего доступно: {usd_to_rub(total_rem, rate):.0f} ₽",
    ]
    end = quota.get("period_end")
    if end:
        lines.append(f"Период до: {end}")
    lines.append(f"\nПополнить: {_pricing_url()}#topup")
    await message.answer("\n".join(lines))


@tg_router.message(Command("profile"))
async def cmd_profile(message: Message, db: Session):
    user = await _require_linked_user(message, db)
    if not user:
        return

    tier = normalize_tier(user.subscription_tier)
    paid = user_has_active_paid_subscription(db, user) if tier_requires_payment(tier) else True
    model = get_selected_model(message.from_user.id) if message.from_user else None
    if not model:
        model = await models_catalog.get_default_model(tier)

    lines = [
        "👤 Профиль",
        f"Email: {display_user_label(user)}",
        f"Тариф: {tier}",
        f"Подписка активна: {'да' if paid else 'нет'}",
        f"Ключ ИИ (Polza): {'есть' if user_has_polza_key(user) else 'нет'}",
        f"Модель: {model}",
    ]
    end = user.subscription_period_end
    if end:
        lines.append(f"Период до: {end.strftime('%d.%m.%Y') if hasattr(end, 'strftime') else end}")
    await message.answer("\n".join(lines))


@tg_router.message(Command("tariffs"))
async def cmd_tariffs(message: Message, db: Session):
    user = await _require_linked_user(message, db)
    if not user:
        return

    rate = get_usd_rub_rate_sync()
    lines = ["📋 Тарифы Nexus (~92% на ИИ):"]
    for tier_id in ("HOBBY", "STANDARD", "PRO", "ULTRA"):
        usd = TIER_PRICES.get(tier_id, 0)
        rub = usd_to_rub(usd, rate)
        pool_rub = usd_to_rub(usd * TIER_POOL_FRACTION, rate)
        hint = TIER_QUOTA_MARKETING.get(tier_id, "")
        lines.append(f"• {tier_id}: ~{rub:.0f} ₽/мес → ~{pool_rub:.0f} ₽ на ИИ")
        if hint:
            lines.append(f"  {hint}")

    kb = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Открыть тарифы", url=_pricing_url())]]
    )
    await message.answer("\n".join(lines), reply_markup=kb)


@tg_router.message(Command("model"))
async def cmd_model(message: Message, db: Session):
    user = await _require_linked_user(message, db)
    if not user:
        return

    models = await models_catalog.list_usable_models_for_user(user.subscription_tier)
    if not models:
        await message.answer("Нет доступных моделей на вашем тарифе.")
        return

    current = get_selected_model(message.from_user.id) if message.from_user else None
    buttons: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for m in models[:12]:
        mid = m.get("id", "")
        label = (m.get("name") or mid).split("/")[-1][:24]
        if current == mid:
            label = f"✓ {label}"
        row.append(InlineKeyboardButton(text=label, callback_data=f"mdl:{mid[:48]}"))
        if len(row) >= 2:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)

    await message.answer("Выберите модель для чата:", reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))


@tg_router.callback_query(F.data.startswith("mdl:"))
async def on_model_pick(callback: CallbackQuery, db: Session):
    if not callback.from_user or not callback.message:
        await callback.answer()
        return

    user = get_user_by_telegram_id(db, callback.from_user.id)
    if not user:
        await callback.answer("Сначала привяжите аккаунт на сайте.", show_alert=True)
        return

    model_id = (callback.data or "")[4:].strip()
    if not model_id:
        await callback.answer("Неверная модель.", show_alert=True)
        return

    from app.routers import ai as ai_router

    try:
        await ai_router._check_model_access(user, model_id)
    except Exception:
        await callback.answer("Модель недоступна на вашем тарифе.", show_alert=True)
        return

    set_selected_model(callback.from_user.id, model_id)
    short = model_id.split("/")[-1]
    await callback.answer(f"Модель: {short}")
    await callback.message.answer(f"Модель чата: {model_id}")


@tg_router.message(Command("image"))
async def cmd_image(message: Message, db: Session):
    user = await _require_linked_user(message, db)
    if not user:
        return
    if not message.from_user or not await _rate_limit_message(message.from_user.id):
        await message.answer("Слишком много сообщений. Подождите минуту.")
        return

    prompt = re.sub(r"^/image\s*", "", message.text or "", flags=re.IGNORECASE).strip()
    if not prompt:
        await message.answer("Напишите, что нарисовать: /image закат над океаном")
        return

    status = await message.answer("🎨 Генерирую изображение…")
    try:
        result = await run_telegram_chat(user, db, prompt, force_image=True)
        if result.get("reply"):
            await message.answer(result["reply"])
        await _send_images(message, result.get("images") or [])
    except TelegramChatError as exc:
        await message.answer(exc.message)
    except Exception as exc:
        logger.exception("telegram image error: %s", exc)
        await message.answer("Ошибка генерации. Попробуйте позже.")
    finally:
        try:
            await status.delete()
        except Exception:
            pass


@tg_router.message(F.text)
async def on_text(message: Message, db: Session):
    user = await _require_linked_user(message, db)
    if not user:
        return
    if not message.from_user or not await _rate_limit_message(message.from_user.id):
        await message.answer("Слишком много сообщений. Подождите минуту.")
        return

    text = (message.text or "").strip()
    if text.startswith("/"):
        return

    status = await message.answer("⏳ Думаю…")
    try:
        result = await run_telegram_chat(user, db, text)
        if result.get("reply"):
            await message.answer(result["reply"][:4000])
        images = result.get("images") or []
        if images:
            await _send_images(message, images)
    except TelegramChatError as exc:
        await message.answer(exc.message)
    except Exception as exc:
        logger.exception("telegram chat error: %s", exc)
        await message.answer("Ошибка ИИ. Попробуйте позже или /profile.")
    finally:
        try:
            await status.delete()
        except Exception:
            pass


_bot: Bot | None = None
_dp: Dispatcher | None = None


class DbSessionMiddleware(BaseMiddleware):
    """Передаёт SQLAlchemy session в хендлеры aiogram."""

    async def __call__(self, handler, event: TelegramObject, data: dict):
        from app.database import SessionLocal

        db = SessionLocal()
        data["db"] = db
        try:
            return await handler(event, data)
        finally:
            db.close()


def get_bot_and_dispatcher() -> tuple[Bot, Dispatcher] | tuple[None, None]:
    global _bot, _dp
    if not telegram_bot_enabled():
        return None, None
    if _bot is None:
        from app.config import TELEGRAM_BOT_TOKEN

        _bot = Bot(token=TELEGRAM_BOT_TOKEN)
        _dp = Dispatcher()
        _dp.update.middleware(DbSessionMiddleware())
        _dp.include_router(tg_router)
    return _bot, _dp
