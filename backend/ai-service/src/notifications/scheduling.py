"""Calendar rules for automatically generated document reminders."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

BERLIN = ZoneInfo("Europe/Berlin")


def today_in_berlin() -> date:
    return datetime.now(BERLIN).date()


def default_reminder_time(due_date: date) -> datetime:
    return datetime.combine(due_date - timedelta(days=3), time(8), tzinfo=BERLIN)
