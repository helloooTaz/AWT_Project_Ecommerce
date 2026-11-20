export enum Role {
  Customer = 'customer',
  Staff = 'staff',
  InventoryManager = 'inventory_manager',
  Admin = 'admin',
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
