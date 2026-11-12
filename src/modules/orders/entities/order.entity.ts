import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export interface ShippingAddressSnapshot {
  recipient: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
}

@Entity('orders')
@Check('ck_orders_currency', `"currency" = 'BDT'`)
@Check('ck_orders_total', '"total_minor" >= 0')
@Index('idx_orders_owner_created', ['userId', 'createdAt', 'id'])
export class Order {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_orders' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_orders_user' })
  user!: Relation<User>;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.PENDING_PAYMENT,
  })
  status!: OrderStatus;

  @Column({ type: 'varchar', length: 3, default: 'BDT' })
  currency!: 'BDT';

  @Column({ name: 'total_minor', type: 'bigint' })
  totalMinor!: string;

  @Column({ name: 'shipping_address_snapshot', type: 'jsonb' })
  shippingAddressSnapshot!: ShippingAddressSnapshot;

  @OneToMany(() => OrderItem, (item) => item.order)
  items!: Relation<OrderItem[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
