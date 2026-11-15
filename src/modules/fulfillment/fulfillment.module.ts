import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersDomainModule } from '../orders/orders-domain.module';
import { ShipmentEntity } from '../shipments/entities/shipment.entity';
import { ShipmentsModule } from '../shipments/shipments.module';
import { AuthModule } from '../auth/auth.module';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentService } from './fulfillment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShipmentEntity]),
    ShipmentsModule,
    OrdersDomainModule,
    InventoryModule,
    AuthModule,
  ],
  controllers: [FulfillmentController],
  providers: [FulfillmentService],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
