import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

const trimString = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateNotificationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  document_id!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ minLength: 1 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiProperty({ format: 'date', example: '2026-12-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  due_date!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-30T09:00:00Z', description: 'Reminder time including timezone' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  remind_at!: string;
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  document_id?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

export class CreatedNotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  reminder_id!: string;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  document_id!: string;

  @ApiProperty({ enum: ['ai', 'manual'] })
  source!: 'ai' | 'manual';

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ format: 'date' })
  due_date!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  created_by!: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at!: string;

  @ApiProperty({ format: 'date-time' })
  updated_at!: string;
}

export class NotificationListDto {
  @ApiProperty({ type: [NotificationDto] })
  data!: NotificationDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}
