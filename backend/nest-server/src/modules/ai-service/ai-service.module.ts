import { Module } from '@nestjs/common';
import { IngestionModule } from './ingestion/ingestion.module';
import { ConversationsModule } from './conversations/conversations.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [IngestionModule, ConversationsModule, NotificationsModule],
  exports: [IngestionModule, ConversationsModule],
})
export class AiServiceModule {}
