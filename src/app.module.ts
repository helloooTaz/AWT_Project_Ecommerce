import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnvironment, type Environment } from './config/env.validation';
import { databaseOptions } from './database/database.options';
import { HealthController } from './health.controller';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        databaseOptions(config.get('DATABASE_URL', { infer: true })),
    }),
    AuthModule,
    AccountsModule,
    AddressesModule,
    CartModule,
    OrdersModule,
    CheckoutModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
