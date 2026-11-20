import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProductVariant } from '../../database/entities';

export interface SellableVariant {
  id: string;
  sku: string;
  productName: string;
  size: string;
  color: string;
  priceMinor: number;
}

@Injectable()
export class CatalogService {
  /**
   * Checkout supplies its transaction manager. Only active products and variants
   * are returned. Callers check for any missing IDs before creating an order.
   */
  findSellableVariants(manager: EntityManager, variantIds: string[]): Promise<SellableVariant[]> {
    if (variantIds.length === 0) return Promise.resolve([]);

    return manager.getRepository(ProductVariant).createQueryBuilder('variant')
      .innerJoin('variant.product', 'product', 'product."isActive" = true')
      .select('variant.id', 'id')
      .addSelect('variant.sku', 'sku')
      .addSelect('product.name', 'productName')
      .addSelect('variant.size', 'size')
      .addSelect('variant.color', 'color')
      .addSelect('variant.priceMinor', 'priceMinor')
      .where('variant.id IN (:...variantIds)', { variantIds })
      .andWhere('variant.isActive = true')
      .getRawMany<SellableVariant>();
  }
}

