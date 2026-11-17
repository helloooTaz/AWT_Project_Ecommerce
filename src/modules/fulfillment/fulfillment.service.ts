import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { ShipmentStatus } from '../../common/enums/shipment-status.enum';
import { InventoryService } from '../inventory/inventory.service';
import { OrderStatus } from '../orders/entities/order.entity';
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
    @InjectRepository(ShipmentEntity)
    private readonly shipmentRepo: Repository<ShipmentEntity>,
    private readonly ordersService: OrdersService,
    private readonly inventoryService: InventoryService,
    private readonly shipmentEmailService: ShipmentEmailService,
    private readonly dataSource: DataSource,
  ) {}

  async listOrders(query: FulfillmentQueryDto) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

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
      const order = await this.ordersService.transitionStatus(
        manager,
        orderId,
        OrderStatus.PROCESSING,
      );
      return order;
    });
  }

  async createShipment(
    orderId: string,
    actorId?: string,
    dto?: CreateShipmentDto,
  ): Promise<ShipmentEntity> {
    const carrier = dto?.carrier || 'Standard Courier';
    const trackingNumber =
      dto?.trackingNumber ||
      `TRK-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;

    let emailRecipient = 'customer@thread.local';
    let customerName = 'Valued Customer';

    const savedShipment = await this.dataSource.transaction(async (manager) => {
      const existing = await manager
        .getRepository(ShipmentEntity)
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

      const userRepo = manager.getRepository(User);
      const user = userRepo
        ? await userRepo.findOne({ where: { id: order.userId } })
        : null;

      const snap = order.shippingAddressSnapshot;
      emailRecipient = user?.email || 'customer@thread.local';
      customerName = snap?.recipient || user?.fullName || 'Valued Customer';

      await this.inventoryService.consumeForShipment(manager, orderId, actorId);

      const shipment = manager.getRepository(ShipmentEntity).create({
        orderId,
        carrier,
        trackingNumber,
        status: ShipmentStatus.IN_TRANSIT,
        shippedAt: new Date(),
      });

      return manager.getRepository(ShipmentEntity).save(shipment);
    });

    this.logger.log(
      `Shipment created successfully for order ${orderId} (Carrier: ${carrier}, Tracking: ${trackingNumber})`,
    );

    await this.shipmentEmailService.sendShipmentNotification({
      toEmail: emailRecipient,
      customerName,
      orderId,
      carrier,
      trackingNumber,
      shippedAt: savedShipment.shippedAt || new Date(),
    });

    return savedShipment;
  }
}
