"""Shared constraints for notification input from APIs and the analyzer."""

from typing import Annotated

from pydantic import StringConstraints

NotificationTitle = Annotated[str, StringConstraints(
    strip_whitespace=True, min_length=1, max_length=255, pattern=r"^[^\r\n]+$",
)]
