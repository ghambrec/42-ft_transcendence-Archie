"""analyzes the document and creates ai_summary and tags"""

from __future__ import annotations
import logging
from datetime import date

from pydantic import BaseModel, ConfigDict, Field
from pydantic_ai import Agent
from pydantic_ai.settings import ModelSettings
from typing import Literal

from src.generation.model import build_model, get_output_type, get_max_input_chars
from src.notifications.scheduling import today_in_berlin
from src.notifications.schemas import NotificationTitle

logger = logging.getLogger(__name__)


class Tags(BaseModel):
    name: str = Field(description="tag name, reuse an existing tag's name exactly if it fits")
    facet: Literal["domain", "doctype"] = Field(description="whether this is a subject-area tag or a document-form tag")
    confidence: float = Field(ge=0, le=1, description="how confident you are that this tag fits")
    parent: str | None = Field(default=None, description="""
                                                        Only set when creating a new tag not listet in the existing tag list. 
                                                        the name of an existing tag this new tag should nest under, or null if it has no fitting parent. 
                                                        always null when reusing an existing tag.
                                                        """
                               )
    description: str | None = Field(default=None, description="Only set when creating a new tag not listet in the existing tag list. Describe here why you created this tag and what this tag is about.")


class DocumentReminder(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: NotificationTitle = Field(description="Short single-line action title in the document's language")
    message: str = Field(min_length=1, description="What must be done by the deadline, grounded in the document, in its language")
    due_date: date = Field(description="Actual action deadline as YYYY-MM-DD; not the invoice, issue or service date")


class DocumentInfos(BaseModel):
    summary: str = Field(description="2-4 sentence summary of what the document is about. its prupose, key facts, parties involved. never mention or list the choosen tags")
    tags: list[Tags] = Field(description="1-3 domain tags plus exactly 1 doctype tag that fits to the document", max_length=5)
    reminders: list[DocumentReminder] = Field(default_factory=list, max_length=3,
        description="Genuine pending action deadlines explicitly stated or unambiguously calculable from the document; empty when none exist")


SYSTEM_PROMPT = """
                    You analyze documents for a document management system.
                    You retrieve the document text, a language code and a list of existing tags. Each tag has a fecat: 'domain' (life area / subject) or
                    'doctype' (kind of document).

                    SUMMARY
                    Respond with a precise summary written in the given language. If no language is given respond in the documents language.
                    Describe what the document actually is about. Its purpose, key facts, and the parties involved.

                    TAGS
                    Tags replace a traditional folder structure - combine broad existing tags instead of inventing a specific one for a combination that
                    doesn't exist yet. Examples:
                        car insurance policy            -> vehicles + insurance + contract
                        invoice from that same insurer  -> vehicles + insurance + invoice
                        electricity bill                -> utilities + invoice
                        payspli                         -> work + statement
                        vaccination record              -> health + certificate
                        flight booking                  -> travel + ticket

                    When both a broad domain tag and one of its more specific children apply, use only the more specific child - never assign a 
                    tag together with its own parent.

                    Never invent a tag that merges two facets ('vehicle-insurance') or that names a specific company, product, person, date or amount.
                    Only propose a new tag if no existing combination fits at all - it must declare its facet and may nest under an existing domain tag as parent.
                    Use 'other' only if no domain tag applies at all.

                    REMINDERS
                    Extract at most three genuine action deadlines: paying an invoice, cancelling a contract,
                    submitting a form or renewing a document. Write title and message in the document's language.
                    Use the current date provided in the request to exclude past deadlines; today's deadlines are valid.
                    Prefer an explicit payment due date, such as 'zahlbar bis', 'faellig am', 'pay by' or 'payment due'.
                    Calculate a relative deadline only when the document provides its reference date:
                    'within 14 days of invoice date' plus an invoice date is sufficient.
                    'within 14 days of receipt' without a known receipt date is NOT sufficient.
                    An invoice date, delivery date, service period or historical date alone is NOT a deadline.
                    Never invent a payment term (for example 14 or 30 days) just because the document is an invoice.
                    Do not create payment reminders for invoices clearly marked already paid.
                    When no supported current/future action deadline exists, return reminders: [].
                    Each due_date must be a real calendar date formatted YYYY-MM-DD. Do not duplicate the same action.
                """

model = build_model()
agent = Agent(
    model, 
    system_prompt=SYSTEM_PROMPT, 
    output_type=get_output_type(DocumentInfos),
    model_settings=ModelSettings(temperature=0.5),
    retries={"output": 3}
    )

# token cap depending on choosen llm provider
_MAX_CHARS = get_max_input_chars()


def _format_tags(tags: list[dict]) -> str:
    domain = [t for t in tags if t["facet"] == "domain"]
    doctype = [t for t in tags if t["facet"] == "doctype"]

    # domain
    lines = ["Domain tags:"]
    for t in domain:
        if t["parent_name"]:
            lines.append(f"- {t['name']} ({t['description']}) - parent: {t['parent_name']}")
        else:
            lines.append(f"- {t['name']} ({t['description']})")

    # doctype
    lines.append("Doctype tags:")
    lines += [f"- {t['name']} ({t['description']})" for t in doctype]
    return "\n".join(lines)


async def analyze_doc(text: str, language: str | None, tags: list[dict]) -> DocumentInfos:
    text_snippet = text[:_MAX_CHARS]
    prompt = f"Current date (Europe/Berlin): {today_in_berlin().isoformat()}\nLanguage: {language}\n\nExisting Tags:\n{_format_tags(tags)}\n\nDocument:\n{text_snippet}"
    logger.debug(f">>> PROMPT:\n{prompt}")
    result = await agent.run(prompt)
    logger.debug(f">>> SUMMARY: {result.output.summary}")
    for tag in result.output.tags:
        logger.debug(f"     - {tag.name}, confidence: {tag.confidence}, parent: {tag.parent}")
    return result.output
