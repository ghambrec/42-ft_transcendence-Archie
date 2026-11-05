import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class NotificationSettingsDto {
  @ApiProperty({
    example: true,
    description: 'notification.active: receive reminder emails for readable documents',
  })
  @IsBoolean()
  active!: boolean;
}
