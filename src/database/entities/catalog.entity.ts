import {
  Check, Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany,
} from 'typeorm';
import { BaseEntity } from './base.entity';

abstract class CatalogEntry extends BaseEntity {
  @Column({ length: 120 })
  name!: string;

  @Column({ length: 120 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;
}

@Entity('categories')
@Index('uq_categories_slug', ['slug'], { unique: true })
export class Category extends CatalogEntry {
  @OneToMany(() => Product, (product) => product.category)
  products!: Product[];
}

@Entity('collections')
@Index('uq_collections_slug', ['slug'], { unique: true })
export class Collection extends CatalogEntry {
  @ManyToMany(() => Product, (product) => product.collections)
  products!: Product[];

  @Column({ default: true })
  isActive!: boolean;
}

@Entity('products')
@Index('uq_products_slug', ['slug'], { unique: true })
@Index('ix_products_category', ['categoryId'])
export class Product extends CatalogEntry {
  @Column('uuid')
  categoryId!: string;

  @ManyToOne(() => Category, (category) => category.products, {
    nullable: false, onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'categoryId' })
  category!: Category;

  @ManyToMany(() => Collection, (collection) => collection.products)
  @JoinTable({
    name: 'product_collections',
    joinColumn: { name: 'productId' },
    inverseJoinColumn: { name: 'collectionId' },
  })
  collections!: Collection[];

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants!: ProductVariant[];

  @Column({ default: true })
  isActive!: boolean;
}

@Entity('product_variants')
@Index('uq_variants_sku', ['sku'], { unique: true })
@Index('uq_variants_options', ['productId', 'size', 'color'], { unique: true })
@Check('ck_variants_price', '"priceMinor" >= 0')
export class ProductVariant extends BaseEntity {
  @Column('uuid')
  productId!: string;

  @ManyToOne(() => Product, (product) => product.variants, {
    nullable: false, onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({ length: 64 })
  sku!: string;

  @Column({ length: 32 })
  size!: string;

  @Column({ length: 48 })
  color!: string;

  @Column('integer')
  priceMinor!: number;

  @Column({ default: true })
  isActive!: boolean;
}
