import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address, Cart, CartItem, Order, OrderItem, User } from '../../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { StaffModule } from '../staff/staff.module';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrderHistoryController } from './order-history.controller';
import { OrderHistoryService } from './order-history.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Address, Cart, CartItem, Order, OrderItem]),
    StaffModule,
    InventoryModule,
  ],
  controllers: [ProfileController, AddressController, CartController, OrderHistoryController, CheckoutController],
  providers: [ProfileService, AddressService, CartService, OrderHistoryService, CheckoutService],
})
export class CustomerModule {}
