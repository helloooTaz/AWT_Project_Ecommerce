import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { SizeGuide } from './size-guide.entity';

function validBounds(measurement: string) {
  const min = `"min_${measurement}"`;
  const max = `"max_${measurement}"`;
  return `${min} BETWEEN 0.01 AND 9999.99 AND ${max} BETWEEN 0.01 AND 9999.99 AND ${min} <= ${max}`;
}

const bound = {
  type: 'numeric',
  precision: 6,
  scale: 2,
  nullable: true,
} as const;

@Entity('size_guide_ranges')
@Unique('uq_size_guide_ranges_size', ['sizeGuideId', 'size'])
@Check('ck_size_guide_ranges_size', `"size" <> '' AND "size" = btrim("size")`)
@Check('ck_size_guide_ranges_height', validBounds('height_cm'))
@Check('ck_size_guide_ranges_weight', validBounds('weight_kg'))
@Check('ck_size_guide_ranges_chest', validBounds('chest_cm'))
@Check('ck_size_guide_ranges_waist', validBounds('waist_cm'))
@Check('ck_size_guide_ranges_hip', validBounds('hip_cm'))
@Check(
  'ck_size_guide_ranges_measurements',
  'num_nonnulls("min_height_cm", "max_height_cm", "min_weight_kg", "max_weight_kg", "min_chest_cm", "max_chest_cm", "min_waist_cm", "max_waist_cm", "min_hip_cm", "max_hip_cm") > 0',
)
export class SizeGuideRange {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_size_guide_ranges',
  })
  id!: string;

  @Column({ name: 'size_guide_id', type: 'uuid' })
  sizeGuideId!: string;

  @ManyToOne(() => SizeGuide, (guide) => guide.ranges, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'size_guide_id',
    foreignKeyConstraintName: 'fk_size_guide_ranges_guide',
  })
  sizeGuide!: Relation<SizeGuide>;

  @Column({ type: 'varchar', length: 32 })
  size!: string;

  @Column({ ...bound, name: 'min_height_cm' })
  minHeightCm!: string | null;

  @Column({ ...bound, name: 'max_height_cm' })
  maxHeightCm!: string | null;

  @Column({ ...bound, name: 'min_weight_kg' })
  minWeightKg!: string | null;

  @Column({ ...bound, name: 'max_weight_kg' })
  maxWeightKg!: string | null;

  @Column({ ...bound, name: 'min_chest_cm' })
  minChestCm!: string | null;

  @Column({ ...bound, name: 'max_chest_cm' })
  maxChestCm!: string | null;

  @Column({ ...bound, name: 'min_waist_cm' })
  minWaistCm!: string | null;

  @Column({ ...bound, name: 'max_waist_cm' })
  maxWaistCm!: string | null;

  @Column({ ...bound, name: 'min_hip_cm' })
  minHipCm!: string | null;

  @Column({ ...bound, name: 'max_hip_cm' })
  maxHipCm!: string | null;
}
