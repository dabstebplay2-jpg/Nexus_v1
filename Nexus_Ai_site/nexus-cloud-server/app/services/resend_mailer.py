import logging

import httpx

from app.config import RESEND_API_KEY, RESEND_FROM_EMAIL

logger = logging.getLogger(__name__)


async def send_login_code_email(to_email: str, code: str) -> bool:
    if not RESEND_API_KEY:
        logger.warning("Resend not configured; skip email to %s", to_email)
        return False

    payload = {
        "from": RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": "Код входа в Nexus",
        "html": (
            f"<p>Ваш код для входа в Nexus:</p>"
            f"<p style='font-size:28px;font-weight:bold;letter-spacing:4px'>{code}</p>"
            f"<p>Код действует 10 минут. Если вы не запрашивали вход — проигнорируйте письмо.</p>"
        ),
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json=payload,
            )
        if r.status_code >= 400:
            logger.error("Resend error %s: %s", r.status_code, r.text[:500])
            return False
        return True
    except Exception as e:
        logger.exception("Resend send failed: %s", e)
        return False


async def send_support_notify_email(
    to_email: str,
    *,
    ticket_id: str,
    user_email: str,
    category: str,
    subject: str,
    preview: str,
) -> bool:
    if not RESEND_API_KEY:
        return False
    payload = {
        "from": RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": f"[Nexus Support] {subject}",
        "html": (
            f"<p>Новое обращение <strong>{ticket_id}</strong></p>"
            f"<p>От: {user_email}<br/>Категория: {category}<br/>Тема: {subject}</p>"
            f"<p>{preview}</p>"
            f"<p>Ответьте в Nexus Admin → вкладка «Поддержка».</p>"
        ),
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json=payload,
            )
        return r.status_code < 400
    except Exception as e:
        logger.exception("Resend support notify failed: %s", e)
        return False
