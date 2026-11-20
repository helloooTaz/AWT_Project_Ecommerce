import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Page } from '../../common/http/pagination';
import { InventoryStock, Product, ProductVariant } from '../../database/entities';
import type { CreateVariantDto, UpdateVariantDto, VariantQueryDto } from './catalog.dto';

@Injectable()
export class VariantsService {
  constructor(
    @InjectRepository(ProductVariant) private readonly variants: Repository<ProductVariant>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateVariantDto): Promise<ProductVariant> {
    if (!(await this.products.existsBy({ id: input.productId }))) {
      throw new NotFoundException('Product not found');
    }
    return this.variants.save(this.variants.create(input));
  }

  async list(query: VariantQueryDto): Promise<Page<ProductVariant>> {
    const [rows, total] = await this.variants.findAndCount({
      where: query.productId ? { productId: query.productId } : {},
      order: { sku: 'ASC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new Page(rows, total, query);
  }

  async get(id: string): Promise<ProductVariant> {
    const variant = await this.variants.findOneBy({ id });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  async update(id: string, input: UpdateVariantDto): Promise<ProductVariant> {
    if (!Object.keys(input).length) return this.get(id);
    const result = await this.variants.update({ id }, input, { returning: '*' });
    const [updated]: ProductVariant[] = result.raw;
    if (!updated) throw new NotFoundException('Variant not found');
    return updated;
  }

  async remove(id: string): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        // The quantity predicate is rechecked after any concurrent stock update.
        await manager.getRepository(InventoryStock).delete({ variantId: id, quantity: 0 });
        const variants = manager.getRepository(ProductVariant);
        // Avoid waiting on variant references while holding a stock lock needed by checkout.
        const variant = await variants.findOne({
          where: { id }, lock: { mode: 'pessimistic_write', onLocked: 'nowait' },
        });
        if (!variant) throw new NotFoundException('Variant not found');
        // Foreign keys block deletion for stock, carts, order items and movement history.
        await variants.delete({ id });
      });
    } catch (error) {
      if (error instanceof QueryFailedError && error.driverError.code === '55P03') {
        throw new ConflictException('Variant is in use by another operation');
      }
      throw error;
    }
  }
}
