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
import { CatalogModule } from './modules/catalog/catalog.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { FulfillmentModule } from './modules/fulfillment/fulfillment.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { SizeGuidesModule } from './modules/size-guides/size-guides.module';
import { SizeRecommendationModule } from './modules/size-recommendations/size-recommendation.module';
import { StockMovementsModule } from './modules/stock-movements/stock-movements.module';
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
    CatalogModule,
    CategoriesModule,
    CollectionsModule,
    OrdersModule,
    CheckoutModule,
    PaymentsModule,
    SizeGuidesModule,
    SizeRecommendationModule,
    ReturnsModule,
    InventoryModule,
    StockMovementsModule,
    FulfillmentModule,
    ShipmentsModule,
  ],
  controllers: [HealthController],
  providers: [RequestLoggingMiddleware],
})
export class AppModule {}
