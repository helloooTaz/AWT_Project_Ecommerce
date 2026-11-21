import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Order } from './order.entity';

export enum ShipmentStatus {
  Created = 'created',
  InTransit = 'in_transit',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
}

@Entity('shipments')
export class Shipment extends BaseEntity {
  @Index('uq_shipments_order', { unique: true })
  @Column('uuid')
  orderId!: string;

  @OneToOne(() => Order, (order) => order.shipment, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @Column({ length: 100 })
  carrier!: string;

  @Index('uq_shipments_tracking', { unique: true })
  @Column({ length: 100 })
  trackingNumber!: string;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    enumName: 'shipment_status',
    default: ShipmentStatus.InTransit,
  })
  status!: ShipmentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  shippedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;
}
