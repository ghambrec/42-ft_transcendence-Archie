import secrets
from fastapi import Depends, Security, HTTPException, Header, Request
from fastapi.security import APIKeyHeader
from uuid import UUID

from src.config import settings

api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)


async def check_api_key(key: str | None = Security(api_key_header)) -> None:
    if key is None or not secrets.compare_digest(key, settings.ai_service_api_key):
        raise HTTPException(status_code=401, detail="invalid or missing api key")


async def get_user_id(user_id: UUID | None = Header(default=None, alias="X-User-Id")) -> UUID:
    if user_id is None:
        raise HTTPException(status_code=400, detail="missing X-User-Id header")
    return user_id


async def require_admin(request: Request, user_id: UUID = Depends(get_user_id)) -> None:
    """Match NestJS's admin check for trusted service-to-service requests."""
    allowed = await request.app.state.db_pool.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM user_permission AS up
            JOIN users AS u ON u.id = up.user_id
            JOIN permissions AS p ON p.id = up.permission_id
            WHERE up.user_id = $1 AND p.perm_key = 'admin'
              AND u.deleted_at IS NULL AND u.is_active = true
        )
        """,
        user_id,
    )
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "AI_NOTIFICATION_ACCESS_DENIED", "retryable": False},
        )
