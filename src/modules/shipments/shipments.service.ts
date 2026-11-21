import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, type AuthenticatedUser } from '../auth/role';
import { Order, Shipment } from '../../database/entities';
import { ShipmentResponseDto } from './shipments.dto';

export function toShipmentResponse(shipment: Shipment): ShipmentResponseDto {
  return {
    id: shipment.id,
    orderId: shipment.orderId,
    carrier: shipment.carrier,
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    shippedAt: shipment.shippedAt,
    deliveredAt: shipment.deliveredAt,
    createdAt: shipment.createdAt,
  };
}

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async getByOrderId(orderId: string, currentUser?: AuthenticatedUser): Promise<ShipmentResponseDto> {
    const shipment = await this.shipments.findOne({ where: { orderId } });
    if (!shipment) {
      throw new NotFoundException(`No shipment found for order ${orderId}`);
    }

    if (currentUser?.role === Role.Customer) {
      const order = await this.orders.findOne({ where: { id: orderId } });
      if (!order || order.userId !== currentUser.id) {
        throw new NotFoundException(`No shipment found for order ${orderId}`);
      }
    }

    return toShipmentResponse(shipment);
  }

  async getByTrackingNumber(trackingNumber: string): Promise<ShipmentResponseDto> {
    const shipment = await this.shipments.findOne({ where: { trackingNumber } });
    if (!shipment) {
      throw new NotFoundException(`Shipment with tracking number ${trackingNumber} was not found`);
    }
    return toShipmentResponse(shipment);
  }
}
