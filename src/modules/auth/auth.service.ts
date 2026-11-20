import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities';
import { AuthResponseDto, LoginDto, RegisterDto } from './auth.dto';
import { hashPassword, verifyPassword } from './password';
import { AuthenticatedUser, Role } from './role';

// Valid bcrypt hash used to keep the password check comparable for unknown accounts.
const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxJTRU2.qroBdty77bTHTxXU2W.';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.users.save(this.users.create({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: Role.Customer,
    }));
    return this.issueToken(user);
  }

  async login(input: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: input.email })
      .getOne();

    const matches = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user?.isActive || !matches) throw new UnauthorizedException('Invalid credentials');
    return this.issueToken(user);
  }

  async findActiveUser(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.users.findOneBy({ id, isActive: true });
    return user ? this.toPublicUser(user) : null;
  }

  private async issueToken(user: User): Promise<AuthResponseDto> {
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser({ id, email, name, role }: User): AuthenticatedUser {
    return { id, email, name, role };
  }
}
