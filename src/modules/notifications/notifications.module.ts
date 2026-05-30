import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { NotificationProcessor } from './notification.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'reminder-queue',
    }),
  ],
  providers: [MailService, NotificationProcessor],
  exports: [BullModule],
})
export class NotificationsModule {}
