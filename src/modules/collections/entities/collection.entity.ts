import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Product } from '../../catalog/entities/product.entity';

@Entity('collections')
@Unique('uq_collections_slug', ['slug'])
export class Collection {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_collections',
  })
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 120 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToMany(() => Product, (product) => product.collections)
  products!: Relation<Product[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

export { Collection as CollectionEntity };
