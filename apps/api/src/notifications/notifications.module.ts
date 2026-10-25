import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { EMAIL_SENDER, createEmailSender } from './email-sender';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: EMAIL_SENDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => createEmailSender(c),
    },
  ],
  exports: [NotificationsService, EMAIL_SENDER],
})
export class NotificationsModule {}
