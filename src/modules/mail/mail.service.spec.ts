import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { MailService } from './mail.service';
import { renderOrderConfirmation } from './order-confirmation.template';
import { createSmtpTransport } from './smtp.transport';
import type { Environment } from '../../config/env.validation';

const order = {
  customerName: 'A & B <customer>',
  orderId: 'order-123',
  totalMinor: '9223372036854775807',
  items: [
    {
      nameSnapshot: 'Shirt <script>',
      sizeSnapshot: '"M"',
      colorSnapshot: "O'Brien",
      quantity: 2,
    },
  ],
};

describe('order confirmation mail', () => {
  it('renders escaped HTML, readable text and the exact largest supported total', () => {
    const { subject, html, text } = renderOrderConfirmation(order);
    expect(subject).toContain('THREAD');
    expect(html).toContain('A &amp; B &lt;customer&gt;');
    expect(html).toContain(
      '2 × Shirt &lt;script&gt; (&quot;M&quot;, O&#39;Brien)',
    );
    expect(html).not.toContain('<script>');
    expect(text).toContain('Hi A & B <customer>,');
    expect(text).toContain('Order reference: order-123');
    for (const body of [text, html]) {
      expect(body).toContain('Your payment was confirmed.');
      expect(body).toContain('BDT 92,233,720,368,547,758.07');
      expect(body).toContain('Thank you for shopping with THREAD.');
    }
  });

  it('renders zero totals with two decimal places', () => {
    expect(
      renderOrderConfirmation({ ...order, totalMinor: '0' }).text,
    ).toContain('BDT 0.00');
  });

  it('creates no SMTP transport when mail is disabled', async () => {
    const settings = new ConfigService<Environment, true>({
      MAIL_ENABLED: false,
    });
    const getRequired = jest.spyOn(settings, 'getOrThrow');
    const transport = createSmtpTransport(settings);
    expect(transport).toBeNull();
    expect(getRequired).not.toHaveBeenCalled();
    const mail = new MailService(transport);
    expect(mail.enabled).toBe(false);
    await expect(
      mail.sendOrderConfirmation('demo@example.com', order),
    ).resolves.toBeUndefined();
  });

  it('suppresses real SMTP transport during tests even when mail is enabled', () => {
    const settings = new ConfigService<Environment, true>({
      MAIL_ENABLED: true,
    });
    expect(createSmtpTransport(settings)).toBeNull();
  });

  it.each([465, 2525])('configures encrypted SMTP on port %i', (port) => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      NODE_ENV: 'development',
    });
    const createTransport = jest.spyOn(nodemailer, 'createTransport');
    try {
      const settings = new ConfigService<Environment, true>({
        MAIL_ENABLED: true,
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: port,
        SMTP_USER: 'sandbox-user',
        SMTP_PASSWORD: 'sandbox-password',
        MAIL_FROM: 'orders@example.com',
      });
      expect(createSmtpTransport(settings)).not.toBeNull();
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          port,
          secure: port === 465,
          requireTLS: port !== 465,
          auth: { user: 'sandbox-user', pass: 'sandbox-password' },
        }),
        { from: { name: 'THREAD', address: 'orders@example.com' } },
      );
    } finally {
      jest.restoreAllMocks();
    }
  });
});
