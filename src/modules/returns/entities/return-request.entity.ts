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
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';

export enum ReturnStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
}

@Entity('return_requests')
@Index('idx_return_requests_order', ['orderId'])
@Index('idx_return_requests_user', ['userId'])
export class ReturnRequest {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_return_requests',
  })
  id!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'fk_return_requests_order',
  })
  order!: Relation<Order>;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_return_requests_user',
  })
  user!: Relation<User>;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'reviewed_by',
    foreignKeyConstraintName: 'fk_return_requests_reviewer',
  })
  reviewer!: Relation<User> | null;

  @Column({
    type: 'enum',
    enum: ReturnStatus,
    enumName: 'return_status',
    default: ReturnStatus.REQUESTED,
  })
  status!: ReturnStatus;

  @Column({ type: 'varchar', length: 255 })
  reason!: string;

  @Column({ name: 'staff_notes', type: 'text', nullable: true })
  staffNotes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

export { ReturnRequest as ReturnRequestEntity };
