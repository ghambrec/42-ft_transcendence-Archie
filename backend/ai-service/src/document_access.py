"""Shared, group-scoped document permissions for API, retrieval and email."""

from uuid import UUID

import asyncpg


DOCUMENT_ACCESS_CTE = """
    document_access AS (
        SELECT DISTINCT dg.document_id, u.id AS user_id, u.email, p.perm_key
        FROM document_groups AS dg
        JOIN documents AS d ON d.id = dg.document_id
        JOIN user_groups AS ug ON ug.group_id = dg.group_id
        JOIN users AS u ON u.id = ug.user_id
        JOIN user_permission AS up
          ON up.user_id = ug.user_id AND up.group_id = dg.group_id
        JOIN permissions AS p ON p.id = up.permission_id
        WHERE d.deleted_at IS NULL
          AND u.deleted_at IS NULL AND u.is_active = true
    )
"""


async def get_document_recipients(
    connection: asyncpg.Connection | asyncpg.Pool, document_id: UUID,
) -> list[asyncpg.Record]:
    return await connection.fetch(
        f"""WITH {DOCUMENT_ACCESS_CTE}
        SELECT DISTINCT user_id, email FROM document_access
        WHERE document_id = $1 AND perm_key = 'documents.read'
        ORDER BY user_id
        """, document_id,
    )


async def has_document_permission(
    connection: asyncpg.Connection | asyncpg.Pool, user_id: UUID,
    document_id: UUID, permission: str = "documents.read",
) -> bool:
    return await connection.fetchval(
        f"""WITH {DOCUMENT_ACCESS_CTE}
        SELECT EXISTS (
            SELECT 1 FROM document_access
            WHERE document_id = $1 AND user_id = $2 AND perm_key = $3
        )
        """, document_id, user_id, permission,
    )
