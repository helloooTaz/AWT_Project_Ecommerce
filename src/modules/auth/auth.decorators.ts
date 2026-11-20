import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AppRequest } from '../../common/http/request-context';
import type { Role } from './role';

export const PUBLIC_ROUTE = 'thread:public';
export const ALLOWED_ROLES = 'thread:roles';

export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: Role[]) => SetMetadata(ALLOWED_ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AppRequest>().user,
);
