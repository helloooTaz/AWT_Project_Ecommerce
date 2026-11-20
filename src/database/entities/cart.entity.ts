import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ProductVariant } from './catalog.entity';
import { User } from './user.entity';

@Entity('carts')
export class Cart extends BaseEntity {
  @Column('uuid')
  userId!: string;

  @OneToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @OneToMany(() => CartItem, (item) => item.cart)
  items!: CartItem[];
}

@Entity('cart_items')
@Index('uq_cart_variant', ['cartId', 'variantId'], { unique: true })
@Index('ix_cart_items_variant', ['variantId'])
@Check('ck_cart_items_quantity', '"quantity" > 0')
export class CartItem extends BaseEntity {
  @Column('uuid')
  cartId!: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart!: Cart;

  @Column('uuid')
  variantId!: string;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variantId' })
  variant!: ProductVariant;

  @Column('integer')
  quantity!: number;
}
