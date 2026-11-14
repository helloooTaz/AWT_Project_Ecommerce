import { Module } from '@nestjs/common';
import { OrdersDomainModule } from './orders-domain.module';

@Module({
  imports: [OrdersDomainModule],
  exports: [OrdersDomainModule],
})
export class OrdersModule { }
