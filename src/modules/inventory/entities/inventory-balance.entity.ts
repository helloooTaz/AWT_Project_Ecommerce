import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { ProductVariantEntity } from '../../catalog/entities/product-variant.entity';

@Entity('inventory_balances')
@Unique('uq_inventory_balances_variant', ['variantId'])
@Check('ck_inventory_balances_on_hand', '"on_hand" >= 0')
@Check(
  'ck_inventory_balances_reserved',
  '"reserved" >= 0 AND "reserved" <= "on_hand"',
)
export class InventoryBalance {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_inventory_balances',
  })
  id!: string;

  @Column({ name: 'variant_id', type: 'uuid', unique: true })
  variantId!: string;

  @ManyToOne(() => ProductVariantEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'variant_id',
    foreignKeyConstraintName: 'fk_inventory_balances_variant',
  })
  variant!: Relation<ProductVariantEntity>;

  @Column({ name: 'on_hand', type: 'integer', default: 0 })
  onHand!: number;

  @Column({ name: 'reserved', type: 'integer', default: 0 })
  reserved!: number;

  get available(): number {
    return Math.max(0, this.onHand - this.reserved);
  }
}

export { InventoryBalance as InventoryBalanceEntity };
