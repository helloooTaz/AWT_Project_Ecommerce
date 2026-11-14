import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface InventoryActorContext {
  id: string;
  email: string;
  role: string;
  ip?: string;
  userAgent?: string;
}

export const InventoryActor = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): InventoryActorContext | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<
        Request & { user?: { id?: string; email?: string; role?: string } }
      >();
    const user = request.user;
    if (!user || !user.id) {
      return undefined;
    }

    return {
      id: user.id,
      email: user.email ?? 'unknown@thread.local',
      role: user.role ?? 'INVENTORY_MANAGER',
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    };
  },
);
