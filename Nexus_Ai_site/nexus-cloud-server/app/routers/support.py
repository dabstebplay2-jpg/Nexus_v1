"""Пользовательские обращения в поддержку."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import UserDB, ensure_support_tables, get_db
from app.schemas import (
    SupportMessageCreate,
    SupportMessageOut,
    SupportTicketCreate,
    SupportTicketDetail,
    SupportTicketListResponse,
    SupportTicketSummary,
)
from app.security import get_current_user
from app.services.auth_rate_limit import check_rate_limit
from app.services.support_service import (
    add_user_message,
    create_ticket,
    get_user_ticket_detail,
    list_user_tickets,
    notify_admin_new_ticket,
    ticket_detail_payload,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/support", tags=["support"])


def _ticket_detail_response(db: Session, ticket) -> SupportTicketDetail:
    try:
        return SupportTicketDetail(**ticket_detail_payload(db, ticket))
    except ValidationError as exc:
        logger.exception("support ticket response validation failed ticket=%s", ticket.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка формирования ответа поддержки.",
        ) from exc


@router.post("/tickets", response_model=SupportTicketDetail)
async def create_support_ticket(
    payload: SupportTicketCreate,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(f"support_create:user:{current_user.id}", 5, 3600.0):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много обращений. Попробуйте позже (до 5 в час).",
        )
    ensure_support_tables()
    try:
        ticket = create_ticket(
            db,
            current_user,
            category=payload.category,
            subject=payload.subject,
            body=payload.body,
            attachments=payload.attachments,
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("support create_ticket failed user=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Не удалось сохранить обращение. Повторите через минуту.",
        ) from exc
    try:
        await notify_admin_new_ticket(ticket, current_user, payload.body)
    except Exception:
        logger.exception("support notify failed ticket=%s", ticket.id)
    return _ticket_detail_response(db, ticket)


@router.get("/tickets", response_model=SupportTicketListResponse)
def list_my_tickets(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_support_tables()
    try:
        items = list_user_tickets(db, current_user)
    except SQLAlchemyError as exc:
        logger.exception("support list_tickets failed user=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Не удалось загрузить обращения.",
        ) from exc
    return SupportTicketListResponse(tickets=[SupportTicketSummary(**t) for t in items])


@router.get("/tickets/{ticket_id}", response_model=SupportTicketDetail)
def get_my_ticket(
    ticket_id: str,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = get_user_ticket_detail(db, current_user, ticket_id)
    return SupportTicketDetail(**data)


@router.post("/tickets/{ticket_id}/messages", response_model=SupportMessageOut)
async def post_user_message(
    ticket_id: str,
    payload: SupportMessageCreate,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_support_tables()
    try:
        msg = add_user_message(
            db,
            current_user,
            ticket_id,
            body=payload.body,
            attachments=payload.attachments,
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("support add_message failed user=%s ticket=%s", current_user.id, ticket_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Не удалось отправить сообщение.",
        ) from exc
    from app.services.support_service import _message_out as msg_out

    return SupportMessageOut(**msg_out(msg))
