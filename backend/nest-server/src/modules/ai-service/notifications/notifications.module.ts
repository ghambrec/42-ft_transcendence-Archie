import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import aiServiceConfig from 'src/config/ai-service.config';
import { SessionModule } from '../../auth/session/session.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ConfigModule.forFeature(aiServiceConfig), SessionModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
