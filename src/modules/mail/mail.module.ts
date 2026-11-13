import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { createSmtpTransport, MAIL_TRANSPORT } from './smtp.transport';

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: createSmtpTransport,
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
