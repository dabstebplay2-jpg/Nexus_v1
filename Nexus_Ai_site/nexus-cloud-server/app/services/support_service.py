"""Обращения в поддержку: тикеты и сообщения с вложениями."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database import SupportMessageDB, SupportTicketDB, UserDB
from app.schemas import ChatAttachment
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

MAX_ATTACHMENTS = 4
VALID_CATEGORIES = frozenset({"complaint", "question", "bug", "other"})
VALID_STATUSES = frozenset({"open", "answered", "closed"})
VALID_IMAGE_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})


def _dt_iso(dt: datetime | None) -> str:
    if dt is None:
        return ""
    return dt.isoformat() + ("Z" if dt.tzinfo is None else "")


def _validate_attachments(attachments: list[ChatAttachment]) -> list[dict[str, Any]]:
    if len(attachments) > MAX_ATTACHMENTS:
        raise HTTPException(status_code=400, detail=f"Не более {MAX_ATTACHMENTS} вложений")
    out: list[dict[str, Any]] = []
    for att in attachments:
        if att.kind == "image":
            if not att.data_base64:
                raise HTTPException(status_code=400, detail=f"Изображение «{att.name}» без данных")
            if (att.mime or "").lower() not in VALID_IMAGE_MIME_TYPES:
                raise HTTPException(status_code=400, detail=f"Неподдерживаемый формат «{att.name}»")
            if len(att.data_base64) > 6_000_000:
                raise HTTPException(status_code=400, detail=f"«{att.name}» слишком большое")
            out.append(
                {
                    "kind": "image",
                    "name": att.name,
                    "mime": att.mime,
                    "data_base64": att.data_base64,
                }
            )
        else:
            text = (att.text or "").strip()
            if not text:
                raise HTTPException(status_code=400, detail=f"Файл «{att.name}» пустой")
            out.append(
                {
                    "kind": "file",
                    "name": att.name,
                    "mime": att.mime,
                    "text": text[:32_000],
                }
            )
    return out


def _attachments_to_out(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for a in raw:
        kind = a.get("kind")
        name = a.get("name") or "file"
        mime = a.get("mime") or ""
        if kind == "image" and a.get("data_base64"):
            mime = mime or "image/jpeg"
            preview = f"data:{mime};base64,{a['data_base64']}"
            items.append(
                {
                    "kind": "image",
                    "name": name,
                    "mime": mime,
                    "preview_url": preview,
                    "text_preview": None,
                }
            )
        elif kind == "file":
            text = a.get("text") or ""
            preview = (text[:200] + "…") if len(text) > 200 else text
            items.append(
                {
                    "kind": "file",
                    "name": name,
                    "mime": mime,
                    "preview_url": None,
                    "text_preview": preview or None,
                }
            )
    return items


def _load_attachments_json(row: SupportMessageDB) -> list[dict[str, Any]]:
    try:
        data = json.loads(row.attachments_json or "[]")
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _message_out(row: SupportMessageDB) -> dict[str, Any]:
    return {
        "id": row.id,
        "author": row.author,
        "body": row.body,
        "attachments": _attachments_to_out(_load_attachments_json(row)),
        "created_at": _dt_iso(row.created_at),
    }


def _last_preview(ticket_id: str, db: Session) -> str | None:
    row = (
        db.query(SupportMessageDB)
        .filter(SupportMessageDB.ticket_id == ticket_id)
        .order_by(SupportMessageDB.created_at.desc())
        .first()
    )
    if not row:
        return None
    text = (row.body or "").strip()
    if text:
        return text[:120] + ("…" if len(text) > 120 else "")
    atts = _load_attachments_json(row)
    if atts:
        return f"📎 {atts[0].get('name', 'вложение')}"
    return None


def _ticket_summary(ticket: SupportTicketDB, db: Session) -> dict[str, Any]:
    return {
        "id": ticket.id,
        "category": ticket.category,
        "subject": ticket.subject,
        "status": ticket.status,
        "created_at": _dt_iso(ticket.created_at),
        "updated_at": _dt_iso(ticket.updated_at),
        "last_preview": _last_preview(ticket.id, db),
    }


def create_ticket(
    db: Session,
    user: UserDB,
    *,
    category: str,
    subject: str,
    body: str,
    attachments: list[ChatAttachment],
) -> SupportTicketDB:
    cat = (category or "question").lower()
    if cat not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail="Некорректная категория")
    att_data = _validate_attachments(attachments)
    now = utc_now()
    ticket_id = str(uuid.uuid4())
    msg_id = str(uuid.uuid4())
    ticket = SupportTicketDB(
        id=ticket_id,
        user_id=user.id,
        category=cat,
        subject=subject.strip()[:200],
        status="open",
        created_at=now,
        updated_at=now,
    )
    msg = SupportMessageDB(
        id=msg_id,
        author="user",
        body=body.strip(),
        attachments_json=json.dumps(att_data, ensure_ascii=False),
        created_at=now,
    )
    ticket.messages.append(msg)
    db.add(ticket)
    db.flush()
    db.commit()
    db.refresh(ticket)
    return ticket


def add_user_message(
    db: Session,
    user: UserDB,
    ticket_id: str,
    *,
    body: str,
    attachments: list[ChatAttachment],
) -> SupportMessageDB:
    ticket = _get_user_ticket(db, user, ticket_id)
    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Обращение закрыто")
    att_data = _validate_attachments(attachments)
    now = utc_now()
    msg = SupportMessageDB(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        author="user",
        body=body.strip(),
        attachments_json=json.dumps(att_data, ensure_ascii=False),
        created_at=now,
    )
    ticket.updated_at = now
    ticket.status = "open"
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def add_admin_reply(
    db: Session,
    ticket_id: str,
    *,
    body: str,
    attachments: list[ChatAttachment],
) -> SupportMessageDB:
    ticket = db.query(SupportTicketDB).filter(SupportTicketDB.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    att_data = _validate_attachments(attachments)
    now = utc_now()
    msg = SupportMessageDB(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        author="admin",
        body=body.strip(),
        attachments_json=json.dumps(att_data, ensure_ascii=False),
        created_at=now,
    )
    ticket.updated_at = now
    ticket.status = "answered"
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def set_ticket_status(db: Session, ticket_id: str, status: str) -> SupportTicketDB:
    st = (status or "").lower()
    if st not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Некорректный статус")
    ticket = db.query(SupportTicketDB).filter(SupportTicketDB.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    ticket.status = st
    ticket.updated_at = utc_now()
    db.commit()
    db.refresh(ticket)
    return ticket


def _get_user_ticket(db: Session, user: UserDB, ticket_id: str) -> SupportTicketDB:
    ticket = (
        db.query(SupportTicketDB)
        .filter(SupportTicketDB.id == ticket_id, SupportTicketDB.user_id == user.id)
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    return ticket


def list_user_tickets(db: Session, user: UserDB) -> list[dict[str, Any]]:
    rows = (
        db.query(SupportTicketDB)
        .filter(SupportTicketDB.user_id == user.id)
        .order_by(SupportTicketDB.updated_at.desc())
        .limit(100)
        .all()
    )
    return [_ticket_summary(t, db) for t in rows]


def get_user_ticket_detail(db: Session, user: UserDB, ticket_id: str) -> dict[str, Any]:
    ticket = _get_user_ticket(db, user, ticket_id)
    return ticket_detail_payload(db, ticket)


def list_admin_tickets(
    db: Session,
    *,
    status: str | None = None,
    q: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    query = db.query(SupportTicketDB, UserDB.email).join(UserDB, UserDB.id == SupportTicketDB.user_id)
    if status:
        query = query.filter(SupportTicketDB.status == status.lower())
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.filter(
            (UserDB.email.ilike(like))
            | (SupportTicketDB.subject.ilike(like))
            | (SupportTicketDB.id.ilike(like))
        )
    rows = query.order_by(SupportTicketDB.updated_at.desc()).limit(limit).all()
    out: list[dict[str, Any]] = []
    for ticket, email in rows:
        item = _ticket_summary(ticket, db)
        item["user_email"] = email
        out.append(item)
    return out


def get_admin_ticket_detail(db: Session, ticket_id: str) -> dict[str, Any]:
    row = (
        db.query(SupportTicketDB, UserDB.email)
        .join(UserDB, UserDB.id == SupportTicketDB.user_id)
        .filter(SupportTicketDB.id == ticket_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    ticket, email = row
    payload = ticket_detail_payload(db, ticket)
    payload["user_email"] = email
    return payload


def ticket_detail_payload(db: Session, ticket: SupportTicketDB) -> dict[str, Any]:
    messages = (
        db.query(SupportMessageDB)
        .filter(SupportMessageDB.ticket_id == ticket.id)
        .order_by(SupportMessageDB.created_at.asc())
        .all()
    )
    return {
        "id": ticket.id,
        "category": ticket.category,
        "subject": ticket.subject,
        "status": ticket.status,
        "created_at": _dt_iso(ticket.created_at),
        "updated_at": _dt_iso(ticket.updated_at),
        "messages": [_message_out(m) for m in messages],
    }


async def notify_admin_new_ticket(ticket: SupportTicketDB, user: UserDB, body: str) -> None:
    from app.config import NEXUS_SUPPORT_NOTIFY_EMAIL, resend_configured

    if not NEXUS_SUPPORT_NOTIFY_EMAIL or not resend_configured():
        return
    from app.services.resend_mailer import send_support_notify_email

    try:
        await send_support_notify_email(
            NEXUS_SUPPORT_NOTIFY_EMAIL,
            ticket_id=ticket.id,
            user_email=user.email,
            category=ticket.category,
            subject=ticket.subject,
            preview=body[:500],
        )
    except Exception:
        logger.exception("support notify email failed")
