import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderCancellationService } from './order-cancellation.service';
import { OrdersDomainModule } from './orders-domain.module';
import { OrdersController } from './orders.controller';

@Module({
  imports: [OrdersDomainModule, AuthModule, InventoryModule],
  controllers: [OrdersController],
  providers: [OrderCancellationService],
  exports: [OrdersDomainModule],
})
export class OrdersModule {}
