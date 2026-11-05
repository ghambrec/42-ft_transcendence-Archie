"""Reminder SQL. The caller owns the connection and locking transaction."""

from uuid import UUID

import asyncpg


async def lock_next_due_reminder(
    connection: asyncpg.Connection, excluded_ids: list[UUID],
) -> asyncpg.Record | None:
    """Lock one due reminder until the caller commits or rolls back."""
    return await connection.fetchrow(
        """
        SELECT r.id, n.document_id, n.title, n.message
        FROM ai_notification_reminders AS r
        JOIN ai_notifications AS n ON n.id = r.ai_notification_id
        JOIN documents AS d ON d.id = n.document_id
        WHERE r.sent_at IS NULL AND r.skipped_at IS NULL AND r.remind_at <= now()
          AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= now())
          AND d.deleted_at IS NULL
          AND NOT (r.id = ANY($1::uuid[]))
        ORDER BY r.remind_at, r.id
        LIMIT 1
        FOR UPDATE OF r SKIP LOCKED
        """, excluded_ids,
    )


async def mark_sent(connection: asyncpg.Connection, reminder_id: UUID) -> None:
    await connection.execute(
        """
        UPDATE ai_notification_reminders
        SET sent_at = clock_timestamp(), error_key = NULL,
            error_detail = NULL, next_attempt_at = NULL
        WHERE id = $1
        """, reminder_id,
    )


async def mark_skipped(connection: asyncpg.Connection, reminder_id: UUID) -> None:
    """Finish without sending when every eligible reader has opted out."""
    await connection.execute(
        """
        UPDATE ai_notification_reminders
        SET skipped_at = clock_timestamp(), error_key = NULL,
            error_detail = NULL, next_attempt_at = NULL
        WHERE id = $1
        """, reminder_id,
    )


async def mark_failed(
    connection: asyncpg.Connection, reminder_id: UUID,
    error_key: str, error_detail: str,
) -> None:
    await connection.execute(
        """
        UPDATE ai_notification_reminders
        SET error_key = $2, error_detail = $3,
            next_attempt_at = clock_timestamp() + INTERVAL '5 minutes'
        WHERE id = $1
        """, reminder_id, error_key, error_detail,
    )
