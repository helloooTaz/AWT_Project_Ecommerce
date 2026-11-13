import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';
import { ProductVariant } from './entities/product-variant.entity';
import { Product, ProductStatus } from './entities/product.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
  ) {}

  findVariantsWithProducts(
    variantIds: string[],
    manager = this.variants.manager,
  ): Promise<ProductVariant[]> {
    return manager.getRepository(ProductVariant).find({
      where: { id: In(variantIds) },
      relations: { product: true },
    });
  }

  isPurchasable(variant: ProductVariant): boolean {
    return (
      variant.isActive && variant.product.status === ProductStatus.PUBLISHED
    );
  }

  async findPublishedProductWithActiveVariants(productId: string) {
    const product = await this.variants.manager
      .getRepository(Product)
      .createQueryBuilder('product')
      .leftJoin('product.variants', 'variant', 'variant.isActive = true')
      .select(['product.id', 'variant.id', 'variant.size'])
      .where({ id: productId, status: ProductStatus.PUBLISHED })
      .getOne();

    return (
      product && {
        id: product.id,
        variants: product.variants.map(({ id, size }) => ({ id, size })),
      }
    );
  }

  async getPurchasableVariants(
    manager: EntityManager,
    variantIds: readonly string[],
  ) {
    const ids = variantIds.map((id) => id.toLowerCase());
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Variant IDs must be unique');
    }

    const variants = await this.findVariantsWithProducts(ids, manager);
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    return ids.map((id) => {
      const variant = byId.get(id);
      if (!variant || !this.isPurchasable(variant)) {
        throw new NotFoundException('Purchasable variant not found');
      }
      return {
        variantId: variant.id,
        productId: variant.product.id,
        productName: variant.product.name,
        productStatus: variant.product.status,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        priceMinor: String(variant.priceMinor),
      };
    });
  }
}
