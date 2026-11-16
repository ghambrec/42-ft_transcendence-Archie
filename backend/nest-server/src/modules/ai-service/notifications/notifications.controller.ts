import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { NotificationsService } from './notifications.service';
import { CreatedNotificationDto, CreateNotificationDto, ListNotificationsQueryDto, NotificationListDto } from './dto/notification.dto';

@ApiTags('notifications')
@UseGuards(SessionAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications of documents readable by the current user' })
  @ApiOkResponse({ type: NotificationListDto })
  list(@Req() req: Request, @Query() query: ListNotificationsQueryDto): Promise<NotificationListDto> {
    return this.notifications.list(req.userId!, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a document notification (requires notifications.manage)' })
  @ApiCreatedResponse({ type: CreatedNotificationDto })
  create(@Req() req: Request, @Body() dto: CreateNotificationDto): Promise<CreatedNotificationDto> {
    return this.notifications.create(req.userId!, dto);
  }
}
