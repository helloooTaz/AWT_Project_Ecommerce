import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { validateEnvironment, type Environment } from './config/env.validation';
import { databaseOptions } from './database/database.options';
import { HealthController } from './health.controller';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SizeRecommendationModule } from './modules/size-recommendations/size-recommendation.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        databaseOptions(config.get('DATABASE_URL', { infer: true })),
    }),
    AuthModule,
    UsersModule,
    AuditModule,
    AnalyticsModule,
    AccountsModule,
    AddressesModule,
    CartModule,
    OrdersModule,
    CheckoutModule,
    PaymentsModule,
    SizeRecommendationModule,
  ],
  controllers: [HealthController],
  providers: [RequestLoggingMiddleware],
})
export class AppModule {}
