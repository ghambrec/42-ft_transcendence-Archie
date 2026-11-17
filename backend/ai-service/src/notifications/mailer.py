"""Plaintext SMTP delivery; callers handle persistence and retries."""

from email.message import EmailMessage

import aiosmtplib

from src.config import settings


async def send_mail(recipient: str, subject: str, body: str) -> None:
    """Send one email; SMTP errors propagate to the caller."""
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = recipient
    message["Subject"] = " ".join(subject.split()) or "Reminder"
    message.set_content(body)

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        timeout=10,
        use_tls=False,
        start_tls=False,
    )
