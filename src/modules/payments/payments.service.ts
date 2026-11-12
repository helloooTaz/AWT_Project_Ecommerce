import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import type { Environment } from '../../config/env.validation';
import { OrdersService } from '../orders/orders.service';
import type { MockPaymentEventDto } from './dto/mock-payment-event.dto';
import { MockPaymentEvent } from './entities/mock-payment-event.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly dataSource: DataSource,
    private readonly orders: OrdersService,
  ) {}

  async createSession(userId: string, orderId: string) {
    if (this.config.get('PAYMENT_PROVIDER', { infer: true }) !== 'MOCK') {
      throw new NotFoundException('Mock payments are disabled');
    }

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const order = await this.orders.lockForPayment(manager, orderId, userId);
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

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
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

      // Read the payment again after taking the same lock used to create sessions.
      const order = await this.orders.lockForPayment(manager, session.orderId);
      const payment = await payments.findOneByOrFail({ id: session.id });
      if (
        amountMinor !== order.totalMinor ||
        amountMinor !== payment.amountMinor
      ) {
        throw new ConflictException('Payment amount does not match the order');
      }
      if (payment.status === status) {
        return { duplicate: false };
      }
      if (payment.status !== PaymentStatus.PENDING) {
        throw new ConflictException(
          'Payment session cannot accept this outcome',
        );
      }

      if (status === PaymentStatus.PAID) {
        const expiresAt = await this.orders.getPaymentReservationExpiry(
          manager,
          order,
        );
        await payments.update(payment.id, { status });
        await this.orders.confirmPayment(manager, order.id, expiresAt);
      } else {
        await payments.update(payment.id, { status });
      }
      return { duplicate: false };
    });
  }
}
