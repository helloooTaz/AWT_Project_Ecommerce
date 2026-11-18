import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { Collection } from '../../collections/entities/collection.entity';
import { ProductVariant } from './product-variant.entity';

export enum ProductStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

@Entity('products')
@Unique('uq_products_slug', ['slug'])
@Index('idx_products_category', ['categoryId'])
export class Product {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_products' })
  id!: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => Category, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'category_id',
    foreignKeyConstraintName: 'fk_products_category',
  })
  category!: Relation<Category>;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 160 })
  slug!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    enumName: 'product_status',
    default: ProductStatus.DRAFT,
  })
  status!: ProductStatus;

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants!: Relation<ProductVariant[]>;

  @ManyToMany(() => Collection, (collection) => collection.products)
  @JoinTable({
    name: 'product_collections',
    joinColumn: {
      name: 'product_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_product_collections_product',
    },
    inverseJoinColumn: {
      name: 'collection_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_product_collections_collection',
    },
  })
  collections!: Relation<Collection[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

export { Product as ProductEntity };
