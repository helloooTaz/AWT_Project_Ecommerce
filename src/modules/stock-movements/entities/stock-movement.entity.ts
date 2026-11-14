import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StockMovementType } from '../../../common/enums/stock-movement-type.enum';

@Entity('stock_movements')
export class StockMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_stock_movements_variant_id')
  @Column({ type: 'uuid', name: 'variant_id' })
  variantId!: string;

  @Index('idx_stock_movements_actor_id')
  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  actorId!: string | null;

  @Column({
    type: 'enum',
    enum: StockMovementType,
    enumName: 'stock_movements_type_enum',
  })
  type!: StockMovementType;

  @Column({ type: 'integer', name: 'quantity' })
  quantity!: number;

  @Column({ type: 'varchar', length: 255, name: 'reason' })
  reason!: string;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
