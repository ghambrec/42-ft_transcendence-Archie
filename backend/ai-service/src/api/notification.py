from fastapi import APIRouter, HTTPException, Request, Depends, Security
from src.api.auth import check_api_key, get_user_id, require_admin
from fastapi import Query 
import logging
from src.config import settings
from uuid import UUID

from src.notifications import service
from datetime import date, datetime
from pydantic import BaseModel, Field, AwareDatetime
from redis.exceptions import RedisError

from src.notifications import service

router = APIRouter(tags=["notififications"], dependencies=[Security(check_api_key)])


class CreateNotificationRequest(BaseModel):
    document_id: UUID
    title: str = Field(strip_whitespace=True, min_length=1, max_length=255)
    message: str = Field(min_length=1)
    due_date: date
    remind_at: AwareDatetime


@router.post("/notification", status_code=201, summary="create new notification for a user")
async def create_notification(
        request: Request,
        body: CreateNotificationRequest,
        user_id: UUID = Depends(get_user_id)
    ):
    try:
        result = await service.create_notification_manual(
            pool=request.app.state.db_pool,
            user_id=user_id,
            document_id=body.document_id,
            title=body.title,
            message=body.message,
            due_date=body.due_date,
            remind_at=body.remind_at,
        )
    except service.NotificationAccessDeniedError as error: 
        raise HTTPException(
            status_code=403,
            detail={
                "code": "AI_NOTIFICATION_ACCESS_DENIED",
                "retryable": False,
            },
        ) from error
    return result 



@router.get("/notifications" , status_code=200 , summary="List notifications of readable document")
async def list_notifications(
    request: Request,
    user_id: UUID = Depends(get_user_id),
    document_id: UUID | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default =0, ge=0),
    ):
    rows = await service.list_notifications(
        pool=request.app.state.db_pool,
        user_id=user_id,
        document_id=document_id,
        limit=limit + 1,
        offset=offset,
    )
    
    return {
        "data": rows[:limit],
        "limit": limit,
        "offset": offset,
        "has_more": len(rows) > limit,
    }

class QueuedReminderDelivery(BaseModel):
    job_id: str


@router.post(
    "/notifications/send-due",
    status_code=202,
    summary="Queue due notification reminders (admin only)",
    response_model=QueuedReminderDelivery,
    dependencies=[Depends(require_admin)],
)
async def send_due(request: Request):
    """Accept a delivery job; the worker performs the actual email sending."""
    try:
        job = await request.app.state.arq_pool.enqueue_job("send_due_reminders")
    except (RedisError, OSError) as error:
        raise HTTPException(
            status_code=503,
            detail={"code": "AI_SERVICE_UNAVAILABLE", "retryable": True},
        ) from error
    if job is None:
        raise HTTPException(
            status_code=503,
            detail={"code": "AI_SERVICE_UNAVAILABLE", "retryable": True},
        )
    return {"job_id": job.job_id}
