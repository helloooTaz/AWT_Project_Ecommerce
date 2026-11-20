import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

export interface ShippingAddress {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string;
  countryCode: string;
}

@Entity('addresses')
@Index('ix_addresses_user', ['userId'])
export class Address extends BaseEntity implements ShippingAddress {
  @Column('uuid')
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ length: 100 })
  recipientName!: string;

  @Column({ length: 30 })
  phone!: string;

  @Column({ length: 200 })
  line1!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  line2!: string | null;

  @Column({ length: 100 })
  city!: string;

  @Column({ length: 20 })
  postalCode!: string;

  @Column({ length: 2 })
  countryCode!: string;
}
