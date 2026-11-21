import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, In, Repository } from 'typeorm';
import { Page } from '../../common/http/pagination';
import { Order, OrderStatus, Shipment, ShipmentStatus } from '../../database/entities';
import { toShipmentResponse } from '../shipments/shipments.service';
import {
  CreateShipmentDto, FulfillmentOrderSummaryDto, FulfillmentQueryDto, PackOrderResponseDto,
} from './fulfillment.dto';
import { ShipmentResponseDto } from '../shipments/shipments.dto';

@Injectable()
export class FulfillmentService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async listOrders(query: FulfillmentQueryDto): Promise<Page<FulfillmentOrderSummaryDto>> {
    const where = query.status
      ? { status: query.status }
      : { status: In([OrderStatus.Placed, OrderStatus.Processing]) };

    const [orders, total] = await this.orders.findAndCount({
      where,
      relations: { user: true, items: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    const items: FulfillmentOrderSummaryDto[] = orders.map((order) => ({
      id: order.id,
      userId: order.userId,
      customerName: order.user?.name || 'Customer',
      customerEmail: order.user?.email || '',
      status: order.status,
      totalMinor: order.totalMinor,
      itemCount: order.items?.length || 0,
      createdAt: order.createdAt,
    }));

    return new Page(items, total, query);
  }

  async packOrder(orderId: string): Promise<PackOrderResponseDto> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.Processing) {
      return { id: order.id, status: order.status };
    }

    if (order.status !== OrderStatus.Placed) {
      throw new ConflictException(`Only placed orders can be packed; order is currently ${order.status}`);
    }

    order.status = OrderStatus.Processing;
    await this.orders.save(order);
    return { id: order.id, status: order.status };
  }

  async createShipment(orderId: string, input: CreateShipmentDto): Promise<ShipmentResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const shipmentRepo = manager.getRepository(Shipment);

      const existingShipment = await shipmentRepo.findOne({ where: { orderId } });
      if (existingShipment) {
        throw new ConflictException(`Shipment already exists for order ${orderId} (tracking: ${existingShipment.trackingNumber})`);
      }

      const order = await orderRepo.findOne({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.status !== OrderStatus.Placed && order.status !== OrderStatus.Processing) {
        throw new ConflictException(`Order cannot be shipped in its current status: ${order.status}`);
      }

      const carrier = input.carrier.trim();
      const trackingNumber = input.trackingNumber?.trim() || this.generateTrackingNumber();

      const existingTracking = await shipmentRepo.findOne({ where: { trackingNumber } });
      if (existingTracking) {
        throw new ConflictException(`Tracking number ${trackingNumber} is already in use`);
      }

      order.status = OrderStatus.Shipped;
      await orderRepo.save(order);

      const shipment = shipmentRepo.create({
        orderId: order.id,
        carrier,
        trackingNumber,
        status: ShipmentStatus.InTransit,
        shippedAt: new Date(),
      });
      const saved = await shipmentRepo.save(shipment);
      return toShipmentResponse(saved);
    });
  }

  private generateTrackingNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    return `TRK-${timestamp}-${suffix}`;
  }
}
