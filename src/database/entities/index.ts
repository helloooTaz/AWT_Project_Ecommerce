import { Address } from './address.entity';
import { Cart, CartItem } from './cart.entity';
import { Category, Collection, Product, ProductVariant } from './catalog.entity';
import { InventoryMovement, InventoryStock } from './inventory.entity';
import { Order, OrderItem, OrderStatus } from './order.entity';
import { Shipment, ShipmentStatus } from './shipment.entity';
import { User } from './user.entity';

export { Address, Cart, CartItem, Category, Collection, Product, ProductVariant,
  InventoryMovement, InventoryStock, Order, OrderItem, OrderStatus, Shipment, ShipmentStatus, User };

export const entities = [
  User, Address, Category, Collection, Product, ProductVariant,
  InventoryStock, InventoryMovement, Cart, CartItem, Order, OrderItem, Shipment,
];
