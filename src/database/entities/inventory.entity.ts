import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ProductVariant } from './catalog.entity';
import { User } from './user.entity';

export enum MovementType {
  Receipt = 'receipt',
  Adjustment = 'adjustment',
  Sale = 'sale',
}

@Entity('inventory_stock')
@Check('ck_stock_nonnegative', '"quantity" >= 0')
export class InventoryStock extends BaseEntity {
  @Column('uuid')
  variantId!: string;

  @OneToOne(() => ProductVariant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variantId' })
  variant!: ProductVariant;

  @Column({ type: 'integer', default: 0 })
  quantity!: number;
}

@Entity('inventory_movements')
@Index('ix_movements_variant_time', ['variantId', 'createdAt'])
@Check('ck_movement_delta', `("type" = 'receipt' AND "delta" > 0)
    OR ("type" = 'adjustment' AND "delta" <> 0)
    OR ("type" = 'sale' AND "delta" < 0)`)
export class InventoryMovement extends BaseEntity {
  @Column('uuid')
  variantId!: string;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variantId' })
  variant!: ProductVariant;

  @Column('uuid')
  actorId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actorId' })
  actor!: User;

  @Column({ type: 'enum', enum: MovementType, enumName: 'inventory_movement_type' })
  type!: MovementType;

  @Column('integer')
  delta!: number;

  @Column({ length: 240 })
  reason!: string;
}
