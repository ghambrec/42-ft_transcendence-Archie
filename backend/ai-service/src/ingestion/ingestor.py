from __future__ import annotations

import logging
import asyncpg
import urllib3.exceptions
import asyncio
from minio.error import MinioException
from pydantic_ai import UnexpectedModelBehavior

from uuid import UUID

from src.storage.minio import MinioDocumentStore
from src.chunking.chunker import chunk_text
from src.embedding.embedder import embed
from src.chunks_storage import ai_chunks
from src.ingestion import status
from src.ingestion.language import detect_language
from src.generation.analyzer import analyze_doc
from src.generation.analyzer import DocumentInfos
from src.ingestion.extraction import extract_text, UnsupportedFileTypeError, NoTextExtracedError
from src.notifications.scheduling import default_reminder_time, today_in_berlin

logger = logging.getLogger(__name__)


async def get_object_key(pool: asyncpg.Pool, doc_id: UUID) -> str | None:
    select = "select object_key from documents where id = $1 and deleted_at is null"
    return await pool.fetchval(select, doc_id)


async def get_tags(pool: asyncpg.Pool) -> list[dict]:
    select = """
                select t.id, t.name, t.label, t.description, t.facet, p.name as parent_name
                from tags t
                left join tags p
                    on p.id = t.parent_id
                order by t.facet, t.name
            """
    rows = await pool.fetch(select)
    return [dict(row) for row in rows]


async def write_llm_data(pool: asyncpg.Pool, doc_id: UUID, data: DocumentInfos, existing_tags: list[dict]) -> None:
    today = today_in_berlin()
    async with pool.acquire() as connection:
        async with connection.transaction():
            # Serialize analyses of the same document and commit all analysis data together.
            if not await connection.fetchval("SELECT id FROM ai_documents WHERE id=$1 FOR UPDATE", doc_id):
                raise ValueError(f"No AI document entry for {doc_id}")
            await connection.execute("UPDATE ai_documents SET ai_summary=$2 WHERE id=$1", doc_id, data.summary)
            await connection.execute("DELETE FROM ai_document_tags WHERE ai_document_id=$1", doc_id)
            lookup_map = {tag["name"].strip().lower(): tag["id"] for tag in existing_tags}
            for ai_tag in data.tags:
                tag_id = lookup_map.get(ai_tag.name.strip().lower())
                if tag_id is None:
                    parent_id = lookup_map.get(ai_tag.parent.strip().lower()) if ai_tag.parent else None
                    await connection.execute(
                        """INSERT INTO ai_document_tags
                        (ai_document_id,proposed_name,proposed_facet,proposed_description,proposed_parent_id,confidence)
                        VALUES($1,$2,$3,$4,$5,$6)""",
                        doc_id, ai_tag.name, ai_tag.facet, ai_tag.description, parent_id, ai_tag.confidence,
                    )
                else:
                    await connection.execute(
                        "INSERT INTO ai_document_tags(ai_document_id,ai_tag_id,confidence) VALUES($1,$2,$3)",
                        doc_id, tag_id, ai_tag.confidence,
                    )

            await connection.execute("DELETE FROM ai_notifications WHERE document_id=$1 AND source='ai'", doc_id)
            for reminder in data.reminders:
                if reminder.due_date < today:
                    continue
                notification_id = await connection.fetchval(
                    """INSERT INTO ai_notifications(document_id,source,title,message,due_date)
                    VALUES($1,'ai',$2,$3,$4) RETURNING id""",
                    doc_id, reminder.title, reminder.message, reminder.due_date,
                )
                await connection.execute(
                    "INSERT INTO ai_notification_reminders(ai_notification_id,remind_at) VALUES($1,$2)",
                    notification_id, default_reminder_time(reminder.due_date),
                )


async def ingest_doc(
    pool: asyncpg.Pool,
    minio: MinioDocumentStore,
    doc_id: UUID
) -> None:
    try:
        await status.mark_as_processing(pool, doc_id)

        obj_key = await get_object_key(pool, doc_id)
        if obj_key is None:
            raise ValueError(f"no object key found for doc_id {doc_id}")

        doc_raw = await minio.GetDocumentBytes(obj_key)
        doc_text = await asyncio.to_thread(extract_text, doc_raw)
        if not doc_text.strip():
            raise NoTextExtracedError()

        language = detect_language(doc_text)

        tags = await get_tags(pool)
        doc_infos = await analyze_doc(doc_text, language, tags)
        await write_llm_data(pool, doc_id, doc_infos, tags)

        chunks = chunk_text(doc_text)
        results: list[dict] = []
        for index, content in enumerate(chunks):
            embedding = await embed(content)
            results.append({
                "chunk_index": index,
                "content": content,
                "embedding": embedding
            })
            logger.debug("chunk %s embedded (%s chars, %s dimensions)", index, len(content), len(embedding))

        await ai_chunks.save_chunks(pool, doc_id, results)
        await status.mark_as_finished(pool, doc_id, language)
        logger.info("ingestion finished for doc: %s", doc_id)

    except UnsupportedFileTypeError as e:
        logger.info("skipping ai processing for doc %s: unsupported mime type %s", doc_id, e.mime_type)
        await status.mark_as_skipped(pool, doc_id, "unsupported_mime_type", str(e))

    except NoTextExtracedError as e:
        logger.info("skipping ai processing for doc %s: could not extract text", doc_id)
        await status.mark_as_skipped(pool, doc_id, "no_text", str(e))

    # ERRORS
    except ValueError as e:
        logger.exception(str(e))
        await status.write_error(pool, doc_id, "not_found", str(e))

    except MinioException as e:
        logger.exception("error calling minio api for doc %s", doc_id)
        await status.write_error(pool, doc_id, "minio_error", str(e))

    except (urllib3.exceptions.MaxRetryError, urllib3.exceptions.NewConnectionError) as e:
        logger.exception("minio not reachable during ingest for doc %s", doc_id)
        await status.write_error(pool, doc_id, "minio_connection", str(e))

    except UnexpectedModelBehavior as e:
        logger.exception("llm output validation failed for doc %s", doc_id)
        await status.write_error(pool, doc_id, "llm_error", str(e))

    except asyncio.CancelledError:
        logger.exception("job timeouted for doc: %s", doc_id)
        await status.write_error(pool, doc_id, "timeout", "job cancelled timeouted")
        raise

    except Exception as e:
        logger.exception("unexpected error during ingest for doc: %s [%s]: %s", doc_id, type(e).__name__, str(e))
        await status.write_error(pool, doc_id, "unknown", str(e))
