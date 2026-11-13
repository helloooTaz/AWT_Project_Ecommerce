import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import type { Environment } from '../../config/env.validation';
import { MailService } from '../mail/mail.service';
import { OrderStatus } from '../orders/entities/order.entity';
import { OrdersService } from '../orders/orders.service';
import type { MockPaymentEventDto } from './dto/mock-payment-event.dto';
import { MockPaymentEvent } from './entities/mock-payment-event.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly dataSource: DataSource,
    private readonly orders: OrdersService,
    private readonly mail: MailService,
  ) {}

  async createSession(userId: string, orderId: string) {
    if (this.config.get('PAYMENT_PROVIDER', { infer: true }) !== 'MOCK') {
      throw new NotFoundException('Mock payments are disabled');
    }

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const order = await this.orders.lockForUpdate(manager, orderId, userId);
      const expiresAt = await this.orders.getPaymentReservationExpiry(
        manager,
        order,
      );
      const payments = manager.getRepository(Payment);
      const existing = await payments.findOneBy({
        orderId: order.id,
        status: In([
          PaymentStatus.INITIATED,
          PaymentStatus.PENDING,
          PaymentStatus.PAID,
        ]),
      });
      if (existing?.status === PaymentStatus.PAID) {
        throw new ConflictException('Order is already paid');
      }

      const providerRef = existing?.providerRef ?? randomUUID();
      if (existing?.status !== PaymentStatus.PENDING || !existing.providerRef) {
        await payments.save({
          id: existing?.id,
          orderId: order.id,
          provider: 'MOCK',
          providerRef,
          amountMinor: order.totalMinor,
          status: PaymentStatus.PENDING,
        });
      }
      return {
        provider: 'MOCK' as const,
        providerRef,
        status: PaymentStatus.PENDING,
        amountMinor: order.totalMinor,
        currency: order.currency,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async processMockEvent({
    eventId,
    providerRef,
    amountMinor,
    status,
  }: MockPaymentEventDto) {
    const reference = providerRef.toLowerCase();
    const payloadHash = createHash('sha256')
      .update(JSON.stringify([reference, amountMinor, status]))
      .digest('hex');

    const { duplicate, confirmedOrderId } = await this.dataSource.transaction(
      'READ COMMITTED',
      async (
        manager,
      ): Promise<{ duplicate: boolean; confirmedOrderId?: string }> => {
        // The unique event ID serializes replays even across different orders.
        const events = manager.getRepository(MockPaymentEvent);
        const result = await events
          .createQueryBuilder()
          .insert()
          .values({ eventId, payloadHash })
          .orIgnore()
          .returning(['eventId'])
          .execute();
        const inserted: unknown[] = result.raw as unknown[];
        if (inserted.length === 0) {
          const previous = await events.findOneByOrFail({ eventId });
          if (previous.payloadHash !== payloadHash) {
            throw new ConflictException('Payment event ID is already in use');
          }
          return { duplicate: true };
        }

        const payments = manager.getRepository(Payment);
        const session = await payments.findOne({
          select: { id: true, orderId: true },
          where: { provider: 'MOCK', providerRef: reference },
        });
        if (!session) {
          throw new NotFoundException('Payment session not found');
        }

        // Recheck eligibility after taking the order lock shared with cancellation.
        const order = await this.orders.lockForUpdate(manager, session.orderId);
        if (order.status === OrderStatus.CANCELLED) {
          throw new ConflictException(
            'Cancelled orders cannot accept payment events',
          );
        }
        if (order.status === OrderStatus.EXPIRED) {
          throw new ConflictException(
            'Expired orders cannot accept payment events',
          );
        }
        const payment = await payments.findOneByOrFail({ id: session.id });
        if (
          amountMinor !== order.totalMinor ||
          amountMinor !== payment.amountMinor
        ) {
          throw new ConflictException(
            'Payment amount does not match the order',
          );
        }
        if (payment.status === status) {
          return { duplicate: false };
        }
        if (payment.status !== PaymentStatus.PENDING) {
          throw new ConflictException(
            'Payment session cannot accept this outcome',
          );
        }

        if (status === PaymentStatus.FAILED) {
          await payments.update(payment.id, { status });
          return { duplicate: false };
        }

        const expiresAt = await this.orders.getPaymentReservationExpiry(
          manager,
          order,
        );
        await payments.update(payment.id, { status });
        await this.orders.confirmPayment(manager, order.id, expiresAt);
        return { duplicate: false, confirmedOrderId: order.id };
      },
    );

    if (confirmedOrderId && this.mail.enabled) {
      await this.sendConfirmation(confirmedOrderId);
    }
    return { duplicate };
  }

  private async sendConfirmation(orderId: string): Promise<void> {
    try {
      const order = await this.orders.findConfirmationDetails(orderId);
      if (!order) {
        this.logger.warn(
          `Order confirmation details unavailable for order ${orderId}`,
        );
        return;
      }
      await this.mail.sendOrderConfirmation(order.user.email, {
        customerName: order.user.fullName,
        orderId: order.id,
        totalMinor: order.totalMinor,
        items: order.items,
      });
    } catch {
      this.logger.warn(`Order confirmation email failed for order ${orderId}`);
    }
  }
}
