import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { isUUID } from 'class-validator';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Environment } from '../../config/env.validation';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './authenticated-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Environment, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  async validate(payload: { sub?: unknown }): Promise<AuthenticatedUser> {
    if (typeof payload?.sub !== 'string' || !isUUID(payload.sub)) {
      throw new UnauthorizedException();
    }
    const user = await this.users.findActiveIdentity(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: user.id, role: user.role };
  }
}
