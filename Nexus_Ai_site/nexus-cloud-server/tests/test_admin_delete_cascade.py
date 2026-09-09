"""Полное удаление пользователя с каскадом."""

from app.database import (
    ChatConversationDB,
    SupportMessageDB,
    SupportTicketDB,
    TransactionDB,
    UserDB,
    WorkspaceDB,
)
from app.services.admin_user_ops import purge_user_data


def test_purge_user_data_removes_related_rows(db_session):
    user = UserDB(
        email="purge@test.com",
        hashed_password="",
        subscription_tier="FREE",
        balance=0,
        refresh_token="ref_purge",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    uid = user.id

    db_session.add(
        TransactionDB(user_id=uid, amount=1.0, tx_type="topup", description="test")
    )
    ticket_id = "ticket-purge-1"
    db_session.add(
        SupportTicketDB(
            id=ticket_id,
            user_id=uid,
            category="question",
            subject="Help",
            status="open",
        )
    )
    db_session.add(
        SupportMessageDB(
            id="msg-purge-1",
            ticket_id=ticket_id,
            author="user",
            body="hello",
        )
    )
    db_session.add(
        ChatConversationDB(
            id="chat-purge-1",
            user_id=uid,
            title="Test",
            messages_json="[]",
        )
    )
    db_session.add(
        WorkspaceDB(
            user_id=uid,
            workspace_id="ws-purge-1",
            name="Purge workspace",
            emoji="✨",
        )
    )
    db_session.commit()

    purge_user_data(db_session, uid)
    db_session.delete(user)
    db_session.commit()

    assert db_session.query(UserDB).filter(UserDB.id == uid).first() is None
    assert db_session.query(TransactionDB).filter(TransactionDB.user_id == uid).count() == 0
    assert db_session.query(SupportTicketDB).filter(SupportTicketDB.user_id == uid).count() == 0
    assert db_session.query(ChatConversationDB).filter(ChatConversationDB.user_id == uid).count() == 0
    assert db_session.query(WorkspaceDB).filter(WorkspaceDB.user_id == uid).count() == 0
