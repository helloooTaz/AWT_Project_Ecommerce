import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { UsersService } from '../users/users.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterDto) {
    const passwordHash = await hash(input.password, 12);
    return this.users.createCustomer(
      input.email.toLowerCase(),
      input.fullName.trim(),
      passwordHash,
    );
  }

  async login(input: LoginDto) {
    const user = await this.users.findActiveCredentials(
      input.email.toLowerCase(),
    );
    if (!user || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return { accessToken: await this.jwt.signAsync({ sub: user.id }) };
  }
}
