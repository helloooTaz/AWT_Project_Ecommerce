import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SizeGuide } from '../size-guides/entities/size-guide.entity';
import { SizeRecommendationController } from './size-recommendation.controller';
import { SizeRecommendationService } from './size-recommendation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SizeGuide]),
    CatalogModule,
    InventoryModule,
  ],
  controllers: [SizeRecommendationController],
  providers: [SizeRecommendationService],
})
export class SizeRecommendationModule {}
