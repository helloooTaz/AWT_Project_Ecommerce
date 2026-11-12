import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { MockPaymentEvent } from './entities/mock-payment-event.entity';
import { Payment } from './entities/payment.entity';
import { MockPaymentWebhookGuard } from './mock-payment-webhook.guard';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, MockPaymentEvent]),
    AuthModule,
    OrdersModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, MockPaymentWebhookGuard],
})
export class PaymentsModule {}
