import { ConfigService } from '@nestjs/config';
import nodemailer, { type SendMailOptions } from 'nodemailer';
import type { Environment } from '../../config/env.validation';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export interface MailTransport {
  sendMail(message: SendMailOptions): Promise<unknown>;
}

export function createSmtpTransport(
  config: ConfigService<Environment, true>,
): MailTransport | null {
  if (
    !config.get('MAIL_ENABLED', { infer: true }) ||
    process.env.NODE_ENV === 'test'
  ) {
    return null;
  }

  const port = config.getOrThrow('SMTP_PORT', { infer: true });
  const secure = port === 465;
  return nodemailer.createTransport(
    {
      host: config.getOrThrow('SMTP_HOST', { infer: true }),
      port,
      secure,
      requireTLS: !secure,
      auth: {
        user: config.getOrThrow('SMTP_USER', { infer: true }),
        pass: config.getOrThrow('SMTP_PASSWORD', { infer: true }),
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      dnsTimeout: 5000,
    },
    {
      from: {
        name: 'THREAD',
        address: config.getOrThrow('MAIL_FROM', { infer: true }),
      },
    },
  );
}
