import { Inject, Injectable } from '@nestjs/common';
import {
  renderOrderConfirmation,
  type OrderConfirmation,
} from './order-confirmation.template';
import { MAIL_TRANSPORT, type MailTransport } from './smtp.transport';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
  ) {}

  get enabled(): boolean {
    return this.transport !== null;
  }

  async sendOrderConfirmation(
    email: string,
    order: OrderConfirmation,
  ): Promise<void> {
    if (this.transport) {
      await this.transport.sendMail({
        to: { address: email, name: '' },
        ...renderOrderConfirmation(order),
      });
    }
  }
}
