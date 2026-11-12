import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from '../orders/orders.module';
import { InventoryBalance } from './entities/inventory-balance.entity';
import { InventoryService } from './inventory.service';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryBalance]), OrdersModule],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
