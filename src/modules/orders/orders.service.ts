import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { OrderItemEntity } from './entities/order-item.entity';
import { OrderEntity, OrderStatus } from './entities/order.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
  ) {}

  async findOrderById(
    orderId: string,
    manager?: EntityManager,
  ): Promise<OrderEntity> {
    const repo = manager ? manager.getRepository(OrderEntity) : this.orderRepo;
    const order = await repo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} was not found`);
    }
    return order;
  }

  async findItemsForReservation(
    manager: EntityManager,
    orderItemIds: string[],
  ): Promise<
    Pick<OrderItemEntity, 'id' | 'variantId' | 'quantity' | 'orderId'>[]
  > {
    if (orderItemIds.length === 0) {
      return [];
    }
    return manager.getRepository(OrderItemEntity).find({
      select: { id: true, variantId: true, quantity: true, orderId: true },
      where: { id: In(orderItemIds) },
    });
  }

  async listEligibleFulfillmentOrders(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ orders: OrderEntity[]; total: number }> {
    const skip = (page - 1) * limit;
    const [orders, total] = await this.orderRepo.findAndCount({
      where: {
        status: In([OrderStatus.CONFIRMED, OrderStatus.PROCESSING]),
      },
      order: { createdAt: 'ASC' },
      skip,
      take: limit,
    });
    return { orders, total };
  }

  async transitionStatus(
    manager: EntityManager,
    orderId: string,
    targetStatus: OrderStatus,
  ): Promise<OrderEntity> {
    const repo = manager.getRepository(OrderEntity);
    const order = await repo
      .createQueryBuilder('order')
      .setLock('pessimistic_write')
      .where('order.id = :orderId', { orderId })
      .getOne();

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} was not found`);
    }

    const currentStatus = order.status;

    if (targetStatus === OrderStatus.PROCESSING) {
      if (currentStatus !== OrderStatus.CONFIRMED) {
        throw new ConflictException(
          `Cannot process/pack order in status '${currentStatus}'. Order must be CONFIRMED.`,
        );
      }
    } else if (targetStatus === OrderStatus.SHIPPED) {
      if (currentStatus !== OrderStatus.PROCESSING) {
        throw new ConflictException(
          `Cannot ship order in status '${currentStatus}'. Order must be PROCESSING.`,
        );
      }
    } else if (targetStatus === OrderStatus.DELIVERED) {
      if (currentStatus !== OrderStatus.SHIPPED) {
        throw new ConflictException(
          `Cannot deliver order in status '${currentStatus}'. Order must be SHIPPED.`,
        );
      }
    } else if (targetStatus === OrderStatus.CANCELLED) {
      if (
        currentStatus === OrderStatus.SHIPPED ||
        currentStatus === OrderStatus.DELIVERED
      ) {
        throw new BadRequestException(
          `Cannot cancel order that has already been ${currentStatus.toLowerCase()}`,
        );
      }
    }

    order.status = targetStatus;
    return repo.save(order);
  }
}
