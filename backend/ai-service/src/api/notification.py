from fastapi import APIRouter, HTTPException, Request, Depends, Security
from src.api.auth import check_api_key, get_user_id
import logging
from src.config import settings
from uuid import UUID

from src.notifications import service
from datetime import date
from pydantic import BaseModel, Field, AwareDatetime



router = APIRouter(tags=["notififications"], dependencies=[Security(check_api_key)])


class CreateNotificationRequest(BaseModel):
    document_id: str = Field(UUID)
    title: str = Field(min_length=1, max_length=255)
    message: str = Field(min_length=1)
    due_date: date
    remind_at: AwareDatetime


@router.post("/notification", status_code=201, summary="create new notification for a user")
async def create_notification(request: Request,
                            body:CreateNotificationRequest,
                            user_id: UUID = Depends(get_user_id)):
    pool = request.app.state.db_pool
    try:
        notification_id = await notification_id.create_notification(pool, user_id)
    except notification_id.UserNotFoundError:
        logging.error("user not found")
        raise HTTPException(status_code=400, detail="user does not exist")
    return {"id": notification_id}


#@router.get("/notification", status_code=200, summary="get all notifications of one user")
#async def get_all_notifications(request: Request,
#                                body: CreateNotificationRequest,
#                                user_id: UUID = Depends(get_user_id)):
#    pool = request.app.state.db_pool