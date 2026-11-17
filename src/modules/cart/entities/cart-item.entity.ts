import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { ProductVariant } from '../../catalog/entities/product-variant.entity';
import { Cart } from './cart.entity';

@Entity('cart_items')
@Unique('uq_cart_items_cart_variant', ['cartId', 'variantId'])
@Check('ck_cart_items_quantity', '"quantity" > 0')
@Index('idx_cart_items_variant', ['variantId'])
export class CartItem {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_cart_items' })
  id!: string;

  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string;

  @ManyToOne(() => Cart, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'cart_id',
    foreignKeyConstraintName: 'fk_cart_items_cart',
  })
  cart!: Relation<Cart>;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'variant_id',
    foreignKeyConstraintName: 'fk_cart_items_variant',
  })
  variant!: Relation<ProductVariant>;

  @Column({ type: 'integer' })
  quantity!: number;
}
