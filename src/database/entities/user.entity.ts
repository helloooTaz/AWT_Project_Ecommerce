import { Check, Column, Entity, Index } from 'typeorm';
import { Role } from '../../modules/auth/role';
import { BaseEntity } from './base.entity';

@Entity('users')
@Index('uq_users_email', ['email'], { unique: true })
@Check('ck_users_email_normalized', '"email" = lower(btrim("email"))')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 60, select: false })
  passwordHash!: string;

  @Column({ type: 'enum', enum: Role, enumName: 'user_role', default: Role.Customer })
  role!: Role;

  @Column({ default: true })
  isActive!: boolean;
}
