import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../modules/auth/authenticated-user';
import type { UserRole } from '../../modules/roles/user-role.enum';

export interface ActorContext {
  id: string;
  role: UserRole;
  ip?: string;
  userAgent?: string;
}

export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<AuthenticatedRequest & Request>();
    const user = request.user;
    if (!user) {
      return undefined;
    }

    const ip =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress;
    const userAgent = request.headers['user-agent'];

    return {
      id: user.id,
      role: user.role,
      ip,
      userAgent,
    };
  },
);
