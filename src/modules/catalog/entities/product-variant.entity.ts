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
import { Product } from './product.entity';

@Entity('product_variants')
@Unique('uq_product_variants_sku', ['sku'])
@Check('ck_product_variants_price', '"price_minor" >= 0')
@Index('idx_product_variants_product', ['productId'])
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_product_variants',
  })
  id!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.variants, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'product_id',
    foreignKeyConstraintName: 'fk_product_variants_product',
  })
  product!: Relation<Product>;

  @Column({ type: 'varchar', length: 64 })
  sku!: string;

  @Column({ type: 'varchar', length: 32 })
  size!: string;

  @Column({ type: 'varchar', length: 64 })
  color!: string;

  @Column({ name: 'price_minor', type: 'integer' })
  priceMinor!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
