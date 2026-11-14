import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { Role } from '../../common/enums/role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async signPayload(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (!payload.sub || !payload.email || !payload.role) {
        throw new UnauthorizedException();
      }

      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.email !== payload.email ||
        user.role !== payload.role
      ) {
        throw new UnauthorizedException();
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: { id: string; email: string; role: Role } }> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = await this.signPayload(payload);
    return { accessToken, user: { id: user.id, email: user.email, role: user.role } };
  }
}
