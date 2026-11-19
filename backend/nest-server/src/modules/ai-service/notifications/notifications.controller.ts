import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { NotificationsService } from './notifications.service';
import { ApplicationException } from 'src/common/errors/application.exception';
import { ErrorCode } from 'src/common/errors/error-code';
import { CreatedNotificationDto, CreateNotificationDto, ListNotificationsQueryDto, NotificationListDto, UpdateNotificationDto, UpdatedNotificationDto } from './dto/notification.dto';

const notificationIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApplicationException(ErrorCode.ValidationFailed),
});

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

  @Patch(':id')
  @ApiOperation({ summary: 'Update a notification (requires notifications.manage)' })
  @ApiOkResponse({ type: UpdatedNotificationDto })
  update(@Req() req: Request, @Param('id', notificationIdPipe) id: string, @Body() dto: UpdateNotificationDto) {
    return this.notifications.update(req.userId!, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Delete a notification and its reminders (requires notifications.manage)' })
  delete(@Req() req: Request, @Param('id', notificationIdPipe) id: string) {
    return this.notifications.delete(req.userId!, id);
  }
}
