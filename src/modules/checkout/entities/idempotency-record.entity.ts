import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';

@Entity('idempotency_records')
@Unique('uq_idempotency_records_user_key', ['userId', 'requestKey'])
@Index('idx_idempotency_records_order', ['orderId'])
export class IdempotencyRecord {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_idempotency_records',
  })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_idempotency_records_user',
  })
  user!: Relation<User>;

  @Column({ name: 'request_key', type: 'varchar', length: 128 })
  requestKey!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'fk_idempotency_records_order',
  })
  order!: Relation<Order>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
