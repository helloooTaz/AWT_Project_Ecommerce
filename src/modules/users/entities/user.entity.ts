import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../../common/enums/role.enum';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('users')
@Unique('uq_users_email', ['email'])
export class User {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_users' })
  id!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 60, select: false })
  passwordHash!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName!: string;

  @Column({
    type: 'enum',
    enum: Role,
    enumName: 'user_role',
    default: Role.CUSTOMER,
  })
  role!: Role;

  @Column({
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status',
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus | string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

export { User as UserEntity };
