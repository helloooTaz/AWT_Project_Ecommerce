import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Category } from '../categories/entities/category.entity';
import { Collection } from '../collections/entities/collection.entity';
import { CatalogService } from './catalog.service';
import { ProductVariant } from './entities/product-variant.entity';
import { Product } from './entities/product.entity';
import { ProductsController } from './products.controller';
import { StaffProductsController } from './staff-products.controller';
import { StaffVariantsController } from './staff-variants.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductVariant, Category, Collection]),
    AuditModule,
  ],
  controllers: [
    ProductsController,
    StaffProductsController,
    StaffVariantsController,
  ],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
