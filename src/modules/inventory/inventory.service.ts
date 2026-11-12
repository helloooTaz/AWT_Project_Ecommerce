import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository, type EntityManager } from 'typeorm';
import { OrdersService } from '../orders/orders.service';
import { InventoryBalance } from './entities/inventory-balance.entity';
import {
  StockReservation,
  StockReservationStatus,
} from './entities/stock-reservation.entity';

export interface StockReservationItem {
  orderItemId: string;
  variantId: string;
  quantity: number;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryBalance)
    private readonly balances: Repository<InventoryBalance>,
    private readonly orders: OrdersService,
  ) {}

  async getAvailability(variantIds: string[]): Promise<Map<string, number>> {
    const balances = await this.balances.findBy({ variantId: In(variantIds) });
    const availability = new Map(variantIds.map((id) => [id, 0]));
    for (const balance of balances) {
      availability.set(balance.variantId, balance.onHand - balance.reserved);
    }
    return availability;
  }

  async reserveForOrder(
    manager: EntityManager,
    items: readonly StockReservationItem[],
    reservationExpiresAt: Date,
  ): Promise<void> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('Stock reservation requires an active transaction');
    }
    if (items.length === 0) {
      return;
    }
    if (!Number.isFinite(reservationExpiresAt.getTime())) {
      throw new BadRequestException('Reservation expiration is invalid');
    }

    const lines = items.map(({ orderItemId, variantId, quantity }) => ({
      orderItemId: orderItemId.toLowerCase(),
      variantId: variantId.toLowerCase(),
      quantity,
    }));
    const orderItemIds = lines.map(({ orderItemId }) => orderItemId);
    if (new Set(orderItemIds).size !== lines.length) {
      throw new ConflictException('Order item already has a reservation');
    }

    const orderItems = await this.orders.findItemsForReservation(
      manager,
      orderItemIds,
    );
    const orderItemsById = new Map(orderItems.map((item) => [item.id, item]));
    const quantityByVariant = new Map<string, number>();
    for (const { orderItemId, variantId, quantity } of lines) {
      const orderItem = orderItemsById.get(orderItemId);
      if (
        orderItem?.variantId !== variantId ||
        orderItem.quantity !== quantity
      ) {
        throw new BadRequestException('Reservation must match its order item');
      }
      quantityByVariant.set(
        variantId,
        (quantityByVariant.get(variantId) ?? 0) + quantity,
      );
    }

    const balances = manager.getRepository(InventoryBalance);
    const balancesByVariant = await this.lockBalancesByVariant(balances, [
      ...quantityByVariant.keys(),
    ]);
    const updates = [...quantityByVariant].map(([variantId, quantity]) => {
      const balance = balancesByVariant.get(variantId);
      if (!balance || balance.onHand - balance.reserved < quantity) {
        throw new ConflictException('Insufficient stock for one or more items');
      }
      return { id: balance.id, reserved: balance.reserved + quantity };
    });

    try {
      await manager.getRepository(StockReservation).insert(
        lines.map((line) => ({
          ...line,
          status: StockReservationStatus.ACTIVE,
          expiresAt: reservationExpiresAt,
        })),
      );
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const cause: unknown = error.driverError;
        if (
          cause instanceof Error &&
          'code' in cause &&
          cause.code === '23505' &&
          'constraint' in cause &&
          cause.constraint === 'uq_stock_reservations_order_item'
        ) {
          throw new ConflictException('Order item already has a reservation');
        }
      }
      throw error;
    }

    for (const { id, reserved } of updates) {
      await balances.update(id, { reserved });
    }
  }

  /** The caller holds the order lock in this transaction. */
  async releaseForOrder(
    manager: EntityManager,
    orderId: string,
  ): Promise<void> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        'Stock reservation release requires an active transaction',
      );
    }

    const reservations = manager.getRepository(StockReservation);
    const active = await reservations
      .createQueryBuilder('reservation')
      .innerJoin('reservation.orderItem', 'item')
      .where('item.orderId = :orderId', { orderId })
      .andWhere('reservation.status = :status', {
        status: StockReservationStatus.ACTIVE,
      })
      .orderBy('reservation.orderItemId', 'ASC')
      .setLock('pessimistic_write', undefined, ['reservation'])
      .getMany();
    if (active.length === 0) {
      return;
    }

    const quantityByVariant = new Map<string, number>();
    for (const { variantId, quantity } of active) {
      quantityByVariant.set(
        variantId,
        (quantityByVariant.get(variantId) ?? 0) + quantity,
      );
    }

    const balances = manager.getRepository(InventoryBalance);
    const balancesByVariant = await this.lockBalancesByVariant(balances, [
      ...quantityByVariant.keys(),
    ]);
    const updates = [...quantityByVariant].map(([variantId, quantity]) => {
      const balance = balancesByVariant.get(variantId);
      if (!balance || balance.reserved < quantity) {
        throw new ConflictException('Reserved stock could not be released');
      }
      return { id: balance.id, reserved: balance.reserved - quantity };
    });
    for (const { id, reserved } of updates) {
      const result = await balances.update(id, { reserved });
      if (result.affected !== 1) {
        throw new ConflictException('Reserved stock could not be released');
      }
    }

    const result = await reservations.update(
      {
        id: In(active.map(({ id }) => id)),
        status: StockReservationStatus.ACTIVE,
      },
      { status: StockReservationStatus.RELEASED },
    );
    if (result.affected !== active.length) {
      throw new ConflictException('Stock reservations could not be released');
    }
  }

  private async lockBalancesByVariant(
    balances: Repository<InventoryBalance>,
    variantIds: string[],
  ) {
    // PostgreSQL locks rows in variant order even when callers pass mixed order.
    const locked = await balances.find({
      where: { variantId: In(variantIds) },
      order: { variantId: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    return new Map(locked.map((balance) => [balance.variantId, balance]));
  }
}
