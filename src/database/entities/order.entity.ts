import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import type { ShippingAddress } from './address.entity';
import { BaseEntity } from './base.entity';
import { ProductVariant } from './catalog.entity';
import { User } from './user.entity';

@Entity('orders')
@Index('ix_orders_user_time', ['userId', 'createdAt'])
@Check('ck_orders_total', '"totalMinor" >= 0')
export class Order extends BaseEntity {
  @Column('uuid')
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column('jsonb')
  shippingAddress!: ShippingAddress;

  @Column('integer')
  totalMinor!: number;

  @OneToMany(() => OrderItem, (item) => item.order)
  items!: OrderItem[];
}

@Entity('order_items')
@Index('uq_order_variant', ['orderId', 'variantId'], { unique: true })
@Index('ix_order_items_variant', ['variantId'])
@Check('ck_order_items_values', '"quantity" > 0 AND "unitPriceMinor" >= 0')
export class OrderItem extends BaseEntity {
  @Column('uuid')
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.items, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @Column('uuid')
  variantId!: string;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variantId' })
  variant!: ProductVariant;

  @Column({ length: 64 })
  sku!: string;

  @Column({ length: 120 })
  productName!: string;

  @Column({ length: 32 })
  size!: string;

  @Column({ length: 48 })
  color!: string;

  @Column('integer')
  unitPriceMinor!: number;

  @Column('integer')
  quantity!: number;
}
