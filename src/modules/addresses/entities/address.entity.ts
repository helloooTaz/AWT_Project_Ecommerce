import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('addresses')
@Index('idx_addresses_owner_created', ['userId', 'createdAt', 'id'])
export class Address {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_addresses' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_addresses_user',
  })
  user!: Relation<User>;

  @Column({ type: 'varchar', length: 120 })
  recipient!: string;

  @Column({ type: 'varchar', length: 16 })
  phone!: string;

  @Column({ name: 'address_line_1', type: 'varchar', length: 255 })
  addressLine1!: string;

  @Column({
    name: 'address_line_2',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
