import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { type AppEnvironment, validateAppEnvironment } from './config/environment';
import { databaseOptions } from './database/database-options';
import { HealthController } from './health.controller';
import { AdminModule } from './modules/admin/admin.module';
import { JwtAuthGuard, RolesGuard } from './modules/auth/auth.guards';
import { AuthModule } from './modules/auth/auth.module';
import { CustomerModule } from './modules/customer/customer.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateAppEnvironment }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) => ({
        ...databaseOptions({
          DB_HOST: config.getOrThrow('DB_HOST', { infer: true }),
          DB_PORT: config.getOrThrow('DB_PORT', { infer: true }),
          DB_NAME: config.getOrThrow('DB_NAME', { infer: true }),
          DB_USER: config.getOrThrow('DB_USER', { infer: true }),
          DB_PASSWORD: config.getOrThrow('DB_PASSWORD', { infer: true }),
        }),
        retryAttempts: 1,
      }),
    }),
    AuthModule,
    CustomerModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
