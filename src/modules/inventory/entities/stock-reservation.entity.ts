import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { StockReservationStatus } from '../../../common/enums/stock-reservation-status.enum';
import { ProductVariantEntity } from '../../catalog/entities/product-variant.entity';
import { OrderItemEntity } from '../../orders/entities/order-item.entity';

export { StockReservationStatus };

@Entity('stock_reservations')
@Unique('uq_stock_reservations_order_item', ['orderItemId'])
@Check('ck_stock_reservations_quantity', '"quantity" > 0')
@Index('idx_stock_reservations_variant', ['variantId'])
@Index('idx_stock_reservations_status_expires', ['status', 'expiresAt'])
export class StockReservation {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_stock_reservations',
  })
  id!: string;

  @Column({ name: 'order_item_id', type: 'uuid', unique: true })
  orderItemId!: string;

  @ManyToOne(() => OrderItemEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'order_item_id',
    foreignKeyConstraintName: 'fk_stock_reservations_order_item',
  })
  orderItem!: Relation<OrderItemEntity>;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @ManyToOne(() => ProductVariantEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'variant_id',
    foreignKeyConstraintName: 'fk_stock_reservations_variant',
  })
  variant!: Relation<ProductVariantEntity>;

  @Column({ name: 'quantity', type: 'integer' })
  quantity!: number;

  @Column({
    type: 'enum',
    enum: StockReservationStatus,
    enumName: 'stock_reservation_status',
    default: StockReservationStatus.ACTIVE,
  })
  status!: StockReservationStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

export { StockReservation as StockReservationEntity };
