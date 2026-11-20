import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category, Collection, Product, ProductVariant } from '../../database/entities';
import { CatalogEntriesService } from './catalog-entries.service';
import { CatalogService } from './catalog.service';
import { CategoriesController } from './categories.controller';
import { CollectionsController } from './collections.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PublicCatalogController } from './public-catalog.controller';
import { VariantsController } from './variants.controller';
import { VariantsService } from './variants.service';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Collection, Product, ProductVariant])],
  controllers: [CategoriesController, CollectionsController, ProductsController, VariantsController, PublicCatalogController],
  providers: [CatalogService, CatalogEntriesService, ProductsService, VariantsService],
  exports: [CatalogService],
})
export class StaffModule {}
