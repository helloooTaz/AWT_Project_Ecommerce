import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnvironment, type Environment } from './config/env.validation';
import { databaseOptions } from './database/database.options';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        databaseOptions(config.get('DATABASE_URL', { infer: true })),
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
