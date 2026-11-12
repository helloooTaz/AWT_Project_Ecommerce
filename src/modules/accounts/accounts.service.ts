import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class AccountsService {
  constructor(private readonly users: UsersService) {}

  async updateProfile(userId: string, fullName: string) {
    const trimmedName = fullName.trim();
    const updated = await this.users.updateActiveFullName(userId, trimmedName);
    if (!updated) {
      throw new UnauthorizedException();
    }
    return { id: userId, fullName: trimmedName };
  }
}
