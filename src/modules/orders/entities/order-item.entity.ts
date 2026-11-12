import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ProductVariant } from '../../catalog/entities/product-variant.entity';
import { Order } from './order.entity';

@Entity('order_items')
@Check('ck_order_items_unit_price', '"unit_price_minor" >= 0')
@Check('ck_order_items_quantity', '"quantity" > 0')
@Check(
  'ck_order_items_line_total',
  '"line_total_minor" = "unit_price_minor" * "quantity"',
)
@Index('idx_order_items_order_created', ['orderId', 'createdAt', 'id'])
@Index('idx_order_items_variant', ['variantId'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_order_items',
  })
  id!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.items, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'fk_order_items_order',
  })
  order!: Relation<Order>;

  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId!: string | null;

  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'variant_id',
    foreignKeyConstraintName: 'fk_order_items_variant',
  })
  variant!: Relation<ProductVariant> | null;

  @Column({ name: 'sku_snapshot', type: 'varchar', length: 64 })
  skuSnapshot!: string;

  @Column({ name: 'name_snapshot', type: 'varchar', length: 160 })
  nameSnapshot!: string;

  @Column({ name: 'size_snapshot', type: 'varchar', length: 32 })
  sizeSnapshot!: string;

  @Column({ name: 'color_snapshot', type: 'varchar', length: 64 })
  colorSnapshot!: string;

  @Column({ name: 'unit_price_minor', type: 'bigint' })
  unitPriceMinor!: string;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'line_total_minor', type: 'bigint' })
  lineTotalMinor!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
