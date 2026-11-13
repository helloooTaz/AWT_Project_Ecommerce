import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  StockReservation,
  StockReservationStatus,
} from '../inventory/entities/stock-reservation.entity';
import { orderDetail, orderSummary } from './dto/order-response';
import { OrderItem } from './entities/order-item.entity';
import { Order, OrderStatus } from './entities/order.entity';

type PendingOrderItem = Pick<
  OrderItem,
  | 'skuSnapshot'
  | 'nameSnapshot'
  | 'sizeSnapshot'
  | 'colorSnapshot'
  | 'unitPriceMinor'
  | 'quantity'
  | 'lineTotalMinor'
> & { variantId: string };

const summaryColumns = {
  id: true,
  status: true,
  currency: true,
  totalMinor: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async listForCustomer(userId: string, { page, limit }: PaginationQueryDto) {
    const [orders, total] = await this.orders.findAndCount({
      select: summaryColumns,
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      orders: orders.map(orderSummary),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getForCustomer(userId: string, id: string) {
    const [order] = await this.orders.find({
      where: { id, userId },
      relations: { items: true },
      order: { items: { createdAt: 'ASC', id: 'ASC' } },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return orderDetail(order);
  }

  /** For trusted backend callers such as fulfillment. */
  async findSummaryById(id: string) {
    const order = await this.orders.findOne({
      select: summaryColumns,
      where: { id },
    });
    return order ? orderSummary(order) : null;
  }

  async findConfirmationDetails(id: string) {
    const [order] = await this.orders.find({
      where: { id },
      select: {
        id: true,
        totalMinor: true,
        user: { id: true, email: true, fullName: true },
        items: {
          id: true,
          nameSnapshot: true,
          sizeSnapshot: true,
          colorSnapshot: true,
          quantity: true,
        },
      },
      relations: { user: true, items: true },
      order: { items: { createdAt: 'ASC', id: 'ASC' } },
    });
    return order;
  }

  async findItemsForReservation(
    manager: EntityManager,
    orderItemIds: string[],
  ): Promise<Pick<OrderItem, 'id' | 'variantId' | 'quantity'>[]> {
    return manager.getRepository(OrderItem).find({
      select: { id: true, variantId: true, quantity: true },
      where: { id: In(orderItemIds) },
    });
  }

  /** Lock the order before payment, cancellation, or reservation changes. */
  async lockForUpdate(manager: EntityManager, id: string, userId?: string) {
    const order = await manager.getRepository(Order).findOne({
      where: userId === undefined ? { id } : { id, userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async getPaymentReservationExpiry(manager: EntityManager, order: Order) {
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new ConflictException('Order is no longer payable');
    }

    const items = await manager.getRepository(OrderItem).find({
      select: { id: true, variantId: true, quantity: true },
      where: { orderId: order.id },
    });
    const reservations = await manager.getRepository(StockReservation).find({
      where: { orderItemId: In(items.map(({ id }) => id)) },
      order: { orderItemId: 'ASC' },
      lock: { mode: 'pessimistic_read' },
    });
    const byItem = new Map(reservations.map((row) => [row.orderItemId, row]));
    if (
      items.length === 0 ||
      items.some(({ id, variantId, quantity }) => {
        const row = byItem.get(id);
        return (
          row?.status !== StockReservationStatus.ACTIVE ||
          row.variantId !== variantId ||
          row.quantity !== quantity
        );
      })
    ) {
      throw new ConflictException('Order stock reservation is unavailable');
    }

    const expiresAt = reservations.reduce(
      (earliest, row) => (row.expiresAt < earliest ? row.expiresAt : earliest),
      reservations[0].expiresAt,
    );
    const [{ expired }] = await manager.query<{ expired: boolean }[]>(
      'SELECT clock_timestamp() >= $1::timestamptz AS expired',
      [expiresAt],
    );
    if (expired) {
      throw new ConflictException('Order stock reservation has expired');
    }
    return expiresAt;
  }

  async confirmPayment(manager: EntityManager, id: string, expiresAt: Date) {
    // Check wall-clock time again after the payment write, which can block.
    const result = await manager
      .createQueryBuilder()
      .update(Order)
      .set({ status: OrderStatus.CONFIRMED })
      .where({ id, status: OrderStatus.PENDING_PAYMENT })
      .andWhere('clock_timestamp() < :expiresAt', { expiresAt })
      .execute();
    if (result.affected !== 1) {
      throw new ConflictException('Order is no longer payable');
    }
  }

  async createPendingOrder(
    manager: EntityManager,
    input: Pick<Order, 'userId' | 'shippingAddressSnapshot' | 'totalMinor'>,
    items: PendingOrderItem[],
  ) {
    const order = await manager.getRepository(Order).save({
      ...input,
      status: OrderStatus.PENDING_PAYMENT,
      currency: 'BDT',
    });
    const savedItems = await manager
      .getRepository(OrderItem)
      .save(items.map((item) => ({ ...item, orderId: order.id })));
    return { order, items: savedItems };
  }
}
