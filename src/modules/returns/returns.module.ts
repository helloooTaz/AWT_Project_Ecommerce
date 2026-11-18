import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Order } from '../orders/entities/order.entity';
import { ReturnRequest } from './entities/return-request.entity';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { StaffReturnsController } from './staff-returns.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReturnRequest, Order]), AuditModule],
  controllers: [ReturnsController, StaffReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
