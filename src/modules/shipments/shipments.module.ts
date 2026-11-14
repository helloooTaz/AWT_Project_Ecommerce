import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShipmentEntity } from './entities/shipment.entity';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentEmailService } from './shipment-email.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([ShipmentEntity]), AuthModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService, ShipmentEmailService],
  exports: [ShipmentsService, ShipmentEmailService, TypeOrmModule],
})
export class ShipmentsModule {}
