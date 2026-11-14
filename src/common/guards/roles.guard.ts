import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

interface RequestWithUserRole extends Request {
  user?: {
    id?: string;
    email?: string;
    role?: Role;
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUserRole>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Forbidden resource: No user credentials');
    }

    const userRole = user.role;
    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Forbidden resource: Requires role [${requiredRoles.join(', ')}], current role is [${userRole ?? 'GUEST'}]`,
      );
    }

    return true;
  }
}
