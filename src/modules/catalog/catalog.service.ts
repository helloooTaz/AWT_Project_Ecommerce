import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProductVariantEntity } from './entities/product-variant.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(ProductVariantEntity)
    private readonly variantRepo: Repository<ProductVariantEntity>,
  ) {}

  async validateVariantExists(
    variantId: string,
  ): Promise<ProductVariantEntity> {
    const variant = await this.variantRepo.findOne({
      where: { id: variantId },
    });
    if (!variant) {
      throw new NotFoundException(
        `Product variant with ID ${variantId} was not found`,
      );
    }
    return variant;
  }

  async getPurchasableVariants(
    variantIds: string[],
  ): Promise<ProductVariantEntity[]> {
    if (!variantIds || variantIds.length === 0) {
      return [];
    }
    return this.variantRepo.findBy({ id: In(variantIds) });
  }
}
