from uuid import UUID

import asyncpg 

import logging
from src.document_access import has_document_permission

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
				permission = "documents.read",
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
	