import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ShipmentStatus } from '../../common/enums/shipment-status.enum';
import { InventoryService } from '../inventory/inventory.service';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { OrdersService } from '../orders/orders.service';
import { ShipmentEntity } from '../shipments/entities/shipment.entity';
import { ShipmentEmailService } from '../shipments/shipment-email.service';
import { User } from '../users/entities/user.entity';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { FulfillmentQueryDto } from './dto/fulfillment-query.dto';

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly inventoryService: InventoryService,
    private readonly shipmentEmailService: ShipmentEmailService,
    private readonly dataSource: DataSource,
  ) {}

  async listOrders(query: FulfillmentQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { orders, total } =
      await this.ordersService.listEligibleFulfillmentOrders(page, limit);

    return {
      items: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async packOrder(orderId: string, actorId?: string) {
    this.logger.log(
      `Marking order ${orderId} as packed/processing by actor ${actorId ?? 'system'}`,
    );

    return this.dataSource.transaction(async (manager) => {
      return this.ordersService.transitionStatus(
        manager,
        orderId,
        OrderStatus.PROCESSING,
      );
    });
  }

  async createShipment(
    orderId: string,
    actorId: string | undefined,
    dto: CreateShipmentDto,
  ): Promise<ShipmentEntity> {
    const carrier = dto.carrier.trim();
    const trackingNumber =
      dto.trackingNumber?.trim() || this.generateTrackingNumber();

    let recipient = {
      email: 'customer@thread.local',
      name: 'Valued Customer',
    };

    const savedShipment = await this.dataSource.transaction(async (manager) => {
      const shipmentRepo = manager.getRepository(ShipmentEntity);

      const existing = await shipmentRepo
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.orderId = :orderId', { orderId })
        .getOne();

      if (existing) {
        throw new ConflictException(
          `Shipment already exists for order ${orderId} (tracking: ${existing.trackingNumber})`,
        );
      }

      const order = await this.ordersService.transitionStatus(
        manager,
        orderId,
        OrderStatus.SHIPPED,
      );

      recipient = await this.resolveRecipient(manager, order);

      await this.inventoryService.consumeForShipment(manager, orderId, actorId);

      const shipment = shipmentRepo.create({
        orderId,
        carrier,
        trackingNumber,
        status: ShipmentStatus.IN_TRANSIT,
        shippedAt: new Date(),
      });

      return shipmentRepo.save(shipment);
    });

    this.logger.log(
      `Shipment created successfully for order ${orderId} (Carrier: ${carrier}, Tracking: ${trackingNumber})`,
    );

    await this.shipmentEmailService.sendShipmentNotification({
      toEmail: recipient.email,
      customerName: recipient.name,
      orderId,
      carrier,
      trackingNumber,
      shippedAt: savedShipment.shippedAt || new Date(),
    });

    return savedShipment;
  }

  private generateTrackingNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    return `TRK-${timestamp}-${suffix}`;
  }

  private async resolveRecipient(
    manager: EntityManager,
    order: Order,
  ): Promise<{ email: string; name: string }> {
    const user = await manager
      .getRepository(User)
      .findOne({ where: { id: order.userId } });

    return {
      email: user?.email || 'customer@thread.local',
      name:
        order.shippingAddressSnapshot?.recipient ||
        user?.fullName ||
        'Valued Customer',
    };
  }
}
