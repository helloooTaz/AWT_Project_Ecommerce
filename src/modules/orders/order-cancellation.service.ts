import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import { Order, OrderStatus } from './entities/order.entity';
import { OrdersService } from './orders.service';

@Injectable()
export class OrderCancellationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
  ) {}

  async cancelForCustomer(userId: string, orderId: string) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const order = await this.orders.lockForUpdate(manager, orderId, userId);
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw new ConflictException(
          'Only pending payment orders can be cancelled',
        );
      }

      await this.inventory.releaseForOrder(manager, order.id);
      const status = OrderStatus.CANCELLED;
      const result = await manager
        .getRepository(Order)
        .update(order.id, { status });
      if (result.affected !== 1) {
        throw new ConflictException('Order could not be cancelled');
      }
      return { orderId: order.id, status };
    });
  }
}
