import type { Request } from 'express';
import type { UserRole } from '../roles/user-role.enum';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
