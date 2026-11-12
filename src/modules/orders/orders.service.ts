import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
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

  async findItemsForReservation(
    manager: EntityManager,
    orderItemIds: string[],
  ): Promise<Pick<OrderItem, 'id' | 'variantId' | 'quantity'>[]> {
    return manager.getRepository(OrderItem).find({
      select: { id: true, variantId: true, quantity: true },
      where: { id: In(orderItemIds) },
    });
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
