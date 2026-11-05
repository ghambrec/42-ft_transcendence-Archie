from fastapi import APIRouter, HTTPException, Request, Depends, Security
from src.api.auth import check_api_key, get_user_id
from fastapi import Query 
import logging
from src.config import settings
from uuid import UUID

from src.notifications import service
from datetime import date, datetime
from pydantic import BaseModel, Field, AwareDatetime

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
        limit=limit,
        offset=offset,
    )
    
    return {
        "data": [dict(row) for row in rows],
        "limit": limit,
        "offset": offset,
    }

#@router.get("/notifications?document_id=<UUID>"