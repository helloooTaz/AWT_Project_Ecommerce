import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryBalanceEntity } from './entities/inventory-balance.entity';
import { StockReservationEntity } from './entities/stock-reservation.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersDomainModule } from '../orders/orders-domain.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryBalanceEntity, StockReservationEntity]),
    StockMovementsModule,
    CatalogModule,
    OrdersDomainModule,
    AuthModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule {}
