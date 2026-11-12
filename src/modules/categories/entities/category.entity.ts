import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('categories')
@Unique('uq_categories_slug', ['slug'])
export class Category {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_categories' })
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 120 })
  slug!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
