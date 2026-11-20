import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import type { AppRequest } from '../../common/http/request-context';
import { ALLOWED_ROLES, PUBLIC_ROUTE } from './auth.decorators';
import { AuthService } from './auth.service';
import type { Role } from './role';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(), context.getClass(),
    ])) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = request.headers.authorization?.match(/^Bearer ([\w.-]+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Bearer access token required');

    let subject: unknown;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
      subject = payload?.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (typeof subject !== 'string' || !isUUID(subject, '4')) {
      throw new UnauthorizedException('Invalid access token subject');
    }

    const user = await this.auth.findActiveUser(subject);
    if (!user) throw new UnauthorizedException('Account is unavailable');
    request.user = user;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ALLOWED_ROLES, [
      context.getHandler(), context.getClass(),
    ]);
    if (!roles?.length) return true;

    const user = context.switchToHttp().getRequest<AppRequest>().user;
    if (!user) throw new UnauthorizedException('Bearer access token required');
    if (!roles.includes(user.role)) throw new ForbiddenException('Role does not allow this action');
    return true;
  }
}
