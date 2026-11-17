import { Roles as CustomerRoles } from '../../modules/roles/roles.decorator';
import type { UserRole } from '../../modules/roles/user-role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => CustomerRoles(roles);
