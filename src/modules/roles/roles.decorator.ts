import { Reflector } from '@nestjs/core';
import type { UserRole } from './user-role.enum';

export const Roles = Reflector.createDecorator<UserRole[]>();
