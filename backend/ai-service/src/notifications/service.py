from uuid import UUID

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
) -> list[asyncpg.Record]:
	
	return await pool.fetch(
		f"""
        WITH {DOCUMENT_ACCESS_CTE}
        SELECT
            n.id,
            n.document_id,
            n.source,
            n.title,
            n.message,
            n.due_date,
            n.created_by,
            n.created_at,
            n.updated_at
        FROM ai_notifications AS n
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
