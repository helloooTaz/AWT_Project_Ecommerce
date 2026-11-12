import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductStatus } from './entities/product.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
  ) {}

  findVariantsWithProducts(variantIds: string[]): Promise<ProductVariant[]> {
    return this.variants.find({
      where: { id: In(variantIds) },
      relations: { product: true },
    });
  }

  isPurchasable(variant: ProductVariant): boolean {
    return (
      variant.isActive && variant.product.status === ProductStatus.PUBLISHED
    );
  }
}
