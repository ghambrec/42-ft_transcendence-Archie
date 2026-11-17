from fastapi import APIRouter, HTTPException, Request, Depends, Security, Response
from src.api.auth import check_api_key, get_user_id, require_admin
from fastapi import Query 
import logging
from src.config import settings
from uuid import UUID

from src.notifications import service
from src.notifications.schemas import NotificationTitle
from datetime import date, datetime
from pydantic import BaseModel, Field, AwareDatetime, ConfigDict, model_validator
from redis.exceptions import RedisError

from src.notifications import service

router = APIRouter(tags=["notififications"], dependencies=[Security(check_api_key)])


class CreateNotificationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    document_id: UUID
    title: NotificationTitle
    message: str = Field(min_length=1)
    due_date: date
    remind_at: AwareDatetime


class UpdateNotificationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: NotificationTitle | None = None
    message: str | None = Field(default=None, min_length=1)
    due_date: date | None = None
    remind_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def require_non_null_changes(self):
        if not self.model_fields_set or any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Provide at least one change; fields cannot be null")
        return self


def mutation_error(error: Exception) -> HTTPException:
    status, code = {
        service.NotificationAccessDeniedError: (403, "AI_NOTIFICATION_ACCESS_DENIED"),
        service.NotificationNotFoundError: (404, "AI_NOTIFICATION_NOT_FOUND"),
        service.NotificationConflictError: (409, "AI_NOTIFICATION_CONFLICT"),
    }[type(error)]
    return HTTPException(status_code=status, detail={"code": code, "retryable": False})


@router.patch("/notifications/{notification_id}", summary="Update a shared notification")
async def update_notification(request: Request, notification_id: UUID, body: UpdateNotificationRequest,
                              user_id: UUID = Depends(get_user_id)):
    try:
        return await service.update_notification(pool=request.app.state.db_pool, user_id=user_id,
            notification_id=notification_id, changes=body.model_dump(exclude_unset=True))
    except (service.NotificationAccessDeniedError, service.NotificationNotFoundError, service.NotificationConflictError) as error:
        raise mutation_error(error) from error


@router.delete("/notifications/{notification_id}", status_code=204, summary="Delete a shared notification")
async def delete_notification(request: Request, notification_id: UUID, user_id: UUID = Depends(get_user_id)):
    try:
        await service.delete_notification(pool=request.app.state.db_pool, user_id=user_id, notification_id=notification_id)
    except (service.NotificationAccessDeniedError, service.NotificationNotFoundError, service.NotificationConflictError) as error:
        raise mutation_error(error) from error
    return Response(status_code=204)


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
