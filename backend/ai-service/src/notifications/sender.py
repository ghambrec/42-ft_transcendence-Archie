"""Cron entry point for document reminder delivery."""

import asyncio
import logging
from uuid import UUID

from src.document_access import get_document_recipients
from src.notifications import repository
from src.notifications.mailer import send_mail

logger = logging.getLogger(__name__)


MAX_REMINDERS_PER_FUNCTIONCALL = 50
DELIVERY_TIMEOUT_SECONDS = 60 # timeout of all resicpents of one duo reminder togehter 


async def send_due_reminders(ctx: dict) -> None:
    pool = ctx["db_pool"]
    attempted: list[UUID] = []
    for _ in range(MAX_REMINDERS_PER_FUNCTIONCALL):
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
                        async with asyncio.timeout(DELIVERY_TIMEOUT_SECONDS):
                            for recipient in recipients:
                                await send_mail(recipient["email"], reminder["title"], reminder["message"])
                    except Exception as error:
                        # SMTP responses may contain addresses or other private data.
                        await repository.mark_failed(
                            connection, reminder["id"], "smtp_error", type(error).__name__,
                        )
                        logger.warning("Reminder %s delivery failed (%s)", reminder["id"], type(error).__name__)
                    else:
                        await repository.mark_sent(connection, reminder["id"])
                        logger.info("Reminder %s sent to %d users", reminder["id"], len(recipients))
        except Exception:
            # Roll back a failed reminder and continue with the others. Cancellation
            # inherits BaseException and deliberately propagates to arq.
            logger.exception("Reminder processing failed")
