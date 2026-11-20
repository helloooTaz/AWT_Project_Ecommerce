import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { Page } from '../../common/http/pagination';
import { Category, Collection, Product } from '../../database/entities';
import type {
  CreateProductDto, ProductQueryDto, ProductResponseDto, PublicProductDto, PublicProductQueryDto,
  UpdateProductDto,
} from './catalog.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  create(input: CreateProductDto): Promise<ProductResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const { collectionIds = [], ...fields } = input;
      await this.requireCategory(manager, fields.categoryId);
      const collections = await this.loadCollections(manager, collectionIds);
      const products = manager.getRepository(Product);
      const product = await products.save(products.create({
        ...fields, description: fields.description ?? null, collections,
      }));
      return this.toStaffProduct(product);
    });
  }

  async list(query: ProductQueryDto): Promise<Page<ProductResponseDto>> {
    const { categoryId, isActive } = query;
    const [rows, total] = await this.products.findAndCount({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      relations: { collections: true },
      order: { slug: 'ASC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new Page(rows.map((row) => this.toStaffProduct(row)), total, query);
  }

  async get(id: string): Promise<ProductResponseDto> {
    return this.readStaffProduct(this.products, id);
  }

  update(id: string, input: UpdateProductDto): Promise<ProductResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const products = manager.getRepository(Product);
      const product = await products.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!product) throw new NotFoundException('Product not found');

      const { collectionIds, ...fields } = input;
      if (fields.categoryId) await this.requireCategory(manager, fields.categoryId);
      if (collectionIds !== undefined) {
        product.collections = await this.loadCollections(manager, collectionIds);
      }
      await products.save(Object.assign(product, fields));
      return this.readStaffProduct(products, id);
    });
  }

  async remove(id: string): Promise<void> {
    // PostgreSQL clears collection links and blocks deletion while variants exist.
    const deleted = await this.products.delete({ id });
    if (!deleted.affected) throw new NotFoundException('Product not found');
  }

  async listPublic(query: PublicProductQueryDto): Promise<Page<PublicProductDto>> {
    const products = this.publicQuery();
    if (query.categoryId) products.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
    const [rows, total] = await products.orderBy('product.slug', 'ASC').addOrderBy('product.id', 'ASC')
      .skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return new Page(rows.map((row) => this.toPublicProduct(row)), total, query);
  }

  async getPublic(id: string): Promise<PublicProductDto> {
    const product = await this.publicQuery().andWhere('product.id = :id', { id }).getOne();
    if (!product) throw new NotFoundException('Product not found');
    return this.toPublicProduct(product);
  }

  private publicQuery() {
    return this.products.createQueryBuilder('product')
      .innerJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variant', 'variant.isActive = true')
      .where('product.isActive = true');
  }

  private async readStaffProduct(products: Repository<Product>, id: string): Promise<ProductResponseDto> {
    const product = await products.findOne({ where: { id }, relations: { collections: true } });
    if (!product) throw new NotFoundException('Product not found');
    return this.toStaffProduct(product);
  }

  private async requireCategory(manager: EntityManager, id: string): Promise<void> {
    if (!(await manager.getRepository(Category).existsBy({ id }))) {
      throw new NotFoundException('Category not found');
    }
  }

  private async loadCollections(manager: EntityManager, ids: string[]): Promise<Collection[]> {
    if (!ids.length) return [];
    const collections = await manager.getRepository(Collection).createQueryBuilder('collection')
      .where('collection.id IN (:...ids)', { ids })
      .orderBy('collection.id', 'ASC')
      .setLock('for_key_share')
      .getMany();
    if (collections.length !== ids.length) throw new NotFoundException('Collection not found');
    return collections;
  }

  private toStaffProduct(product: Product): ProductResponseDto {
    const { id, name, slug, description, categoryId, isActive, createdAt, updatedAt, collections } = product;
    return {
      id, name, slug, description, categoryId, isActive, createdAt, updatedAt,
      collectionIds: collections.map((collection) => collection.id).sort(),
    };
  }

  private toPublicProduct(product: Product): PublicProductDto {
    const { id, name, slug, description, category, variants } = product;
    return {
      id, name, slug, description,
      category: { id: category.id, name: category.name, slug: category.slug },
      variants: variants.map(({ id, sku, size, color, priceMinor }) => ({ id, sku, size, color, priceMinor }))
        .sort((first, second) => first.sku.localeCompare(second.sku) || first.id.localeCompare(second.id)),
    };
  }
}
