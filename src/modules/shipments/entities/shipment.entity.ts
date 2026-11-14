import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShipmentStatus } from '../../../common/enums/shipment-status.enum';

@Entity('shipments')
export class ShipmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_shipments_order_id', { unique: true })
  @Column({ type: 'uuid', name: 'order_id', unique: true })
  orderId!: string;

  @Column({ type: 'varchar', length: 100, name: 'carrier' })
  carrier!: string;

  @Index('idx_shipments_tracking_number', { unique: true })
  @Column({
    type: 'varchar',
    length: 100,
    name: 'tracking_number',
    unique: true,
  })
  trackingNumber!: string;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    enumName: 'shipments_status_enum',
    default: ShipmentStatus.CREATED,
  })
  status!: ShipmentStatus;

  @Column({
    type: 'timestamp with time zone',
    name: 'shipped_at',
    nullable: true,
  })
  shippedAt!: Date | null;

  @Column({
    type: 'timestamp with time zone',
    name: 'delivered_at',
    nullable: true,
  })
  deliveredAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
