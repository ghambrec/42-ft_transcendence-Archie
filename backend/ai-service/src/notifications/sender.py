"""Cron entry point for document reminder delivery."""

import asyncio
import logging
from uuid import UUID

from aiosmtplib.errors import SMTPException

from src.document_access import get_document_recipients
from src.notifications import repository
from src.notifications.mailer import send_mail
from src.config import settings

logger = logging.getLogger(__name__)

async def send_due_reminders(ctx: dict) -> None:
    pool = ctx["db_pool"]
    attempted: list[UUID] = []
    for attempts_index in range(settings.notification_batch_size):
        try:
            async with pool.acquire() as connection:
                async with connection.transaction():
                    reminder = await repository.lock_next_due_reminder(connection, attempted)
                    if reminder is None:
                        return
                    attempted.append(reminder["id"])
                    recipients = await get_document_recipients(connection, reminder["document_id"])
                    if not recipients:
                        await repository.mark_failed(
                            connection, reminder["id"], "no_recipients",
                            "No active users have documents.read access.",
                        )
                        logger.warning("Reminder %s has no eligible recipients", reminder["id"])
                        continue

                    try:
                        async with asyncio.timeout(settings.notification_delivery_timeout_seconds):
                            for recipient in recipients:
                                await send_mail(recipient["email"], reminder["title"], reminder["message"])
                    except (SMTPException, OSError, TimeoutError) as error:
                        await repository.mark_failed(
                            connection, reminder["id"], "smtp_error", type(error).__name__,
                        )
                        logger.warning("Reminder %s delivery failed (%s)", reminder["id"], type(error).__name__)
                    else:
                        await repository.mark_sent(connection, reminder["id"])
                        logger.info("Reminder %s sent to %d users", reminder["id"], len(recipients))
        except Exception:
            logger.exception("Reminder processing failed")
            raise
