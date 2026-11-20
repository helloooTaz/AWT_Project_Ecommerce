import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities';
import type { UserResponseDto } from '../auth/auth.dto';
import { Role } from '../auth/role';

@Injectable()
export class ProfileService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async updateName(id: string, name: string): Promise<UserResponseDto> {
    const result = await this.users.update(
      { id, isActive: true, role: Role.Customer },
      { name },
      { returning: ['id', 'email', 'name', 'role'] },
    );
    const [profile]: UserResponseDto[] = result.raw;
    if (!profile) throw new UnauthorizedException('Account is unavailable');
    return profile;
  }
}
