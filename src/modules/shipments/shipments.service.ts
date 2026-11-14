import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShipmentEntity } from './entities/shipment.entity';

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(ShipmentEntity)
    private readonly shipmentRepo: Repository<ShipmentEntity>,
  ) {}

  async getByOrderId(orderId: string): Promise<ShipmentEntity> {
    const shipment = await this.shipmentRepo.findOne({ where: { orderId } });
    if (!shipment) {
      throw new NotFoundException(`No shipment found for order ${orderId}`);
    }
    return shipment;
  }

  async getByTrackingNumber(trackingNumber: string): Promise<ShipmentEntity> {
    const shipment = await this.shipmentRepo.findOne({
      where: { trackingNumber },
    });
    if (!shipment) {
      throw new NotFoundException(
        `Shipment with tracking number ${trackingNumber} was not found`,
      );
    }
    return shipment;
  }
}
