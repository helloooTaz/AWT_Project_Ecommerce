import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';

export enum PaymentStatus {
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

@Entity('payments')
@Unique('uq_payments_provider_ref', ['providerRef'])
@Check('ck_payments_amount', '"amount_minor" >= 0')
@Index('idx_payments_order', ['orderId'])
@Index('uq_payments_open_or_paid_order', ['orderId'], {
  unique: true,
  where: `"status" IN ('INITIATED', 'PENDING', 'PAID')`,
})
export class Payment {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_payments' })
  id!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'fk_payments_order',
  })
  order!: Relation<Order>;

  @Column({ type: 'varchar', length: 32 })
  provider!: 'MOCK';

  @Column({
    name: 'provider_ref',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  providerRef!: string | null;

  @Column({ name: 'amount_minor', type: 'bigint' })
  amountMinor!: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
    default: PaymentStatus.INITIATED,
  })
  status!: PaymentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
