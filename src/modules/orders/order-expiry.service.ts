import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';
import type { Environment } from '../../config/env.validation';
import {
  StockReservation,
  StockReservationStatus,
} from '../inventory/entities/stock-reservation.entity';
import { InventoryService } from '../inventory/inventory.service';
import { Order, OrderStatus } from './entities/order.entity';
import { OrdersService } from './orders.service';

@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);
  private afterOrderId?: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async processBatch(): Promise<number> {
    const limit = this.config.get('ORDER_EXPIRY_BATCH_SIZE', { infer: true });
    let candidates = await this.findCandidates(limit, this.afterOrderId);
    if (candidates.length === 0 && this.afterOrderId) {
      candidates = await this.findCandidates(limit);
    }
    // Advance even after failures so a full page of failing orders cannot starve later ones.
    this.afterOrderId =
      candidates.length === limit ? candidates.at(-1)?.id : undefined;

    let expired = 0;
    for (const { id } of candidates) {
      try {
        if (await this.expireOrder(id)) expired++;
      } catch {
        this.logger.warn(
          'An order expiry transaction failed and will be retried',
        );
      }
    }
    return expired;
  }

  async expireOrder(orderId: string): Promise<boolean> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // A busy order or inventory row should not hold up the rest of the batch indefinitely.
      await manager.query("SET LOCAL lock_timeout = '5s'");
      const order = await this.orders.lockForUpdate(manager, orderId);
      if (order.status !== OrderStatus.PENDING_PAYMENT) return false;

      const due = await this.expiredReservations(manager)
        .andWhere('item.orderId = :orderId', { orderId: order.id })
        .getExists();
      if (!due) return false;

      await this.inventory.releaseForOrder(manager, order.id);
      const result = await manager.getRepository(Order).update(order.id, {
        status: OrderStatus.EXPIRED,
      });
      if (result.affected !== 1)
        throw new Error('Order expiry transition failed');
      return true;
    });
  }

  private findCandidates(limit: number, afterOrderId?: string) {
    const query = this.expiredReservations(this.dataSource.manager)
      .innerJoin('item.order', 'purchase')
      .select('item.orderId', 'id')
      .distinct(true)
      .andWhere('purchase.status = :pending', {
        pending: OrderStatus.PENDING_PAYMENT,
      })
      .orderBy('item.orderId', 'ASC')
      .limit(limit);
    if (afterOrderId) {
      query.andWhere('item.orderId > :afterOrderId', { afterOrderId });
    }
    return query.getRawMany<{ id: string }>();
  }

  private expiredReservations(manager: EntityManager) {
    return manager
      .getRepository(StockReservation)
      .createQueryBuilder('reservation')
      .innerJoin('reservation.orderItem', 'item')
      .where('reservation.status = :active', {
        active: StockReservationStatus.ACTIVE,
      })
      .andWhere('reservation.expiresAt <= statement_timestamp()');
  }
}
