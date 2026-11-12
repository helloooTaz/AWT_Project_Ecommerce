import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../roles/user-role.enum';
import { User, UserStatus } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async createCustomer(email: string, fullName: string, passwordHash: string) {
    const user = await this.users.save(
      this.users.create({
        email,
        fullName,
        passwordHash,
        role: UserRole.CUSTOMER,
      }),
    );
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }

  findActiveCredentials(email: string) {
    return this.users.findOne({
      where: { email, status: UserStatus.ACTIVE },
      select: { id: true, passwordHash: true },
    });
  }

  findActiveIdentity(id: string) {
    return this.users.findOne({
      where: { id, status: UserStatus.ACTIVE },
      select: { id: true, role: true },
    });
  }
}
