from uuid import UUID
import json

import asyncpg 

import logging
from src.document_access import DOCUMENT_ACCESS_CTE, has_document_permission

logger = logging.getLogger(__name__)

from datetime import date, datetime

class NotificationAccessDeniedError(Exception):
	pass

async def create_notification_manual(
		pool: asyncpg.Pool,
		*,
		user_id: UUID,
		document_id: UUID,
		title: str,
		message: str, 
		due_date: date, 
		remind_at: datetime
)-> dict[str, UUID]:
	async with pool.acquire() as connection:
		async with connection.transaction():
			allowed = await  has_document_permission(
				connection=  connection,
				user_id=user_id,
				document_id= document_id,
				permission = "notifications.manage",
			)
			if not allowed:
				raise NotificationAccessDeniedError()
	
			notification_id = await connection.fetchval(
				"""
				Insert into ai_notifications (
					document_id, source, title, message, due_date, created_by)
				Values ( $1, 'manual', $2, $3, $4, $5)
				Returning id
				""",
				document_id, title, message, due_date, user_id
			)
			reminder_id = await connection.fetchval(
				"""
				Insert into ai_notification_reminders(
					ai_notification_id, remind_at
				)
				Values ( $1, $2)	
				Returning id 	
				""",
				notification_id,
				remind_at,
			)
		return {
			"id": notification_id,
			"reminder_id" : reminder_id
		}
	

async def list_notifications(
    pool: asyncpg.Pool,
    *,
    user_id: UUID,
    document_id: UUID | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, object]]:
    rows = await pool.fetch(
        f"""
        WITH {DOCUMENT_ACCESS_CTE}
        SELECT
            n.id,
            n.document_id,
            d.filename AS document_name,
            n.source,
            n.title,
            n.message,
            n.due_date,
            n.created_by,
            n.created_at,
            n.updated_at,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', r.id,
                    'remind_at', r.remind_at,
                    'sent_at', r.sent_at,
                    'skipped_at', r.skipped_at,
                    'next_attempt_at', r.next_attempt_at,
                    'error_key', r.error_key,
                    'status', CASE
                        WHEN r.sent_at IS NOT NULL THEN 'sent'
                        WHEN r.skipped_at IS NOT NULL THEN 'skipped'
                        WHEN r.error_key IS NOT NULL THEN 'failed'
                        ELSE 'scheduled'
                    END
                ) ORDER BY r.remind_at, r.id)
                FROM ai_notification_reminders AS r
                WHERE r.ai_notification_id = n.id
            ), '[]'::jsonb) AS reminders
        FROM ai_notifications AS n
        JOIN documents AS d ON d.id = n.document_id
		Where exists (
			Select 1
			From document_access as access
			where access.document_id = n.document_id
			And access.user_id = $1
			and access.perm_key = 'documents.read'
		)
			And ($2::uuid is NUll or n.document_id = $2) 
		Order by n.created_at Desc, n.id Desc
		Limit $3 Offset $4
		""", 
		user_id,
        document_id,
        limit,
        offset,

    )
    # asyncpg returns JSONB as text unless a custom codec is registered.
    return [{**dict(row), "reminders": json.loads(row["reminders"])} for row in rows]
