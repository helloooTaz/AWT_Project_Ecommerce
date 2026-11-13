import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Product } from '../../catalog/entities/product.entity';
import { SizeGuideRange } from './size-guide-range.entity';

@Entity('size_guides')
@Unique('uq_size_guides_product', ['productId'])
@Check('ck_size_guides_measurement_unit', `"measurement_unit" = 'cm'`)
export class SizeGuide {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_size_guides',
  })
  id!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'product_id',
    foreignKeyConstraintName: 'fk_size_guides_product',
  })
  product!: Relation<Product>;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({
    name: 'measurement_unit',
    type: 'varchar',
    length: 2,
    default: 'cm',
  })
  measurementUnit!: 'cm';

  @OneToMany(() => SizeGuideRange, (range) => range.sizeGuide)
  ranges!: Relation<SizeGuideRange[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
