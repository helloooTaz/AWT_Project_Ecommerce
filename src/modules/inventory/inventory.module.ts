import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersDomainModule } from '../orders/orders-domain.module';
import { InventoryBalance } from './entities/inventory-balance.entity';
import { InventoryService } from './inventory.service';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryBalance]), OrdersDomainModule],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
