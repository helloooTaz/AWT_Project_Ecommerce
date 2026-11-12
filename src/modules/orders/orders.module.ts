import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderCancellationService } from './order-cancellation.service';
import { OrderExpiryScheduler } from './order-expiry.scheduler';
import { OrderExpiryService } from './order-expiry.service';
import { OrdersDomainModule } from './orders-domain.module';
import { OrdersController } from './orders.controller';

@Module({
  imports: [OrdersDomainModule, AuthModule, InventoryModule],
  controllers: [OrdersController],
  providers: [
    OrderCancellationService,
    OrderExpiryService,
    OrderExpiryScheduler,
  ],
  exports: [OrdersDomainModule],
})
export class OrdersModule {}
