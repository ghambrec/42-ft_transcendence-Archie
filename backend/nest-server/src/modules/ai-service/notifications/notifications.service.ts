import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import aiServiceConfig from 'src/config/ai-service.config';
import { ApplicationException } from 'src/common/errors/application.exception';
import { ErrorCode } from 'src/common/errors/error-code';
import { mapAiServiceError } from 'src/common/errors/ai-service-error.mapper';
import { CreatedNotificationDto, CreateNotificationDto, ListNotificationsQueryDto, NotificationListDto } from './dto/notification.dto';

@Injectable()
export class NotificationsService {
  private readonly baseUrl: string;

  constructor(
    @Inject(aiServiceConfig.KEY) private readonly config: ConfigType<typeof aiServiceConfig>,
    private readonly logger: Logger,
  ) {
    this.baseUrl = `http://${config.host}:${config.port}`;
  }

  private async request<T>(userId: string, path: string, init: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'X-API-KEY': this.config.apiKey,
          'X-User-Id': userId,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
      // A missing internal route is a deployment problem, not a missing conversation.
      if (response.status === 404) throw new ApplicationException(ErrorCode.AiServiceUnavailable);
      if (!response.ok) throw await mapAiServiceError(response);
      try {
        return await response.json() as T;
      } catch {
        throw new ApplicationException(ErrorCode.AiInvalidResponse);
      }
    } catch (error) {
      if (error instanceof ApplicationException) throw error;
      this.logger.warn({ path }, 'AI service notification request failed');
      throw new ApplicationException(ErrorCode.AiServiceUnavailable);
    }
  }

  create(userId: string, dto: CreateNotificationDto): Promise<CreatedNotificationDto> {
    return this.request(userId, '/notification', { method: 'POST', body: JSON.stringify(dto) });
  }

  list(userId: string, query: ListNotificationsQueryDto): Promise<NotificationListDto> {
    const params = new URLSearchParams({ limit: String(query.limit), offset: String(query.offset) });
    if (query.document_id) params.set('document_id', query.document_id);
    return this.request(userId, `/notifications?${params}`);
  }
}
