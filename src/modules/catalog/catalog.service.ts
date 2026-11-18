import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Category } from '../categories/entities/category.entity';
import { Collection } from '../collections/entities/collection.entity';
import type { CreateProductDto } from './dto/create-product.dto';
import type { CreateVariantDto } from './dto/create-variant.dto';
import type { ProductQueryDto } from './dto/product-query.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductVariant } from './entities/product-variant.entity';
import { Product, ProductStatus } from './entities/product.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Collection)
    private readonly collections: Repository<Collection>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------------
  // Existing public methods consumed by Cart / Checkout / Size
  // -------------------------------------------------------------

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

  async validateVariantExists(variantId: string): Promise<ProductVariant> {
    const variant = await this.variants.findOne({ where: { id: variantId } });
    if (!variant) {
      throw new NotFoundException(
        `Product variant with ID ${variantId} was not found`,
      );
    }
    return variant;
  }

  // -------------------------------------------------------------
  // Public Catalog Browsing (Published Only)
  // -------------------------------------------------------------

  async findPublishedProducts(query: ProductQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect(
        'product.variants',
        'variant',
        'variant.isActive = true',
      )
      .leftJoinAndSelect('product.collections', 'collection')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED });

    if (query.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    if (query.collectionId) {
      qb.andWhere('collection.id = :collectionId', {
        collectionId: query.collectionId,
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        '(product.name ILIKE :search OR product.slug ILIKE :search OR product.description ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    if (query.minPrice !== undefined) {
      qb.andWhere('variant.priceMinor >= :minPrice', {
        minPrice: query.minPrice,
      });
    }

    if (query.maxPrice !== undefined) {
      qb.andWhere('variant.priceMinor <= :maxPrice', {
        maxPrice: query.maxPrice,
      });
    }

    qb.orderBy('product.createdAt', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async findPublishedProductById(id: string): Promise<Product> {
    const product = await this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect(
        'product.variants',
        'variant',
        'variant.isActive = true',
      )
      .leftJoinAndSelect('product.collections', 'collection')
      .where('product.id = :id AND product.status = :status', {
        id,
        status: ProductStatus.PUBLISHED,
      })
      .getOne();

    if (!product) {
      throw new NotFoundException(
        `Published product with ID ${id} was not found`,
      );
    }

    return product;
  }

  async findPublishedProductBySlug(slug: string): Promise<Product> {
    const product = await this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect(
        'product.variants',
        'variant',
        'variant.isActive = true',
      )
      .leftJoinAndSelect('product.collections', 'collection')
      .where('product.slug = :slug AND product.status = :status', {
        slug,
        status: ProductStatus.PUBLISHED,
      })
      .getOne();

    if (!product) {
      throw new NotFoundException(
        `Published product with slug "${slug}" was not found`,
      );
    }

    return product;
  }

  // -------------------------------------------------------------
  // Staff Product Management
  // -------------------------------------------------------------

  async findStaffProducts(query: ProductQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variant')
      .leftJoinAndSelect('product.collections', 'collection');

    if (query.status) {
      qb.andWhere('product.status = :status', { status: query.status });
    }

    if (query.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    if (query.collectionId) {
      qb.andWhere('collection.id = :collectionId', {
        collectionId: query.collectionId,
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        '(product.name ILIKE :search OR product.slug ILIKE :search OR product.description ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    qb.orderBy('product.createdAt', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async findProductById(id: string): Promise<Product> {
    const product = await this.products.findOne({
      where: { id },
      relations: {
        category: true,
        variants: true,
        collections: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} was not found`);
    }

    return product;
  }

  async createProduct(
    actorId: string,
    input: CreateProductDto,
  ): Promise<Product> {
    const existing = await this.products.findOne({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new ConflictException(
        `Product with slug "${input.slug}" already exists`,
      );
    }

    const category = await this.categories.findOne({
      where: { id: input.categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Category with ID ${input.categoryId} was not found`,
      );
    }

    let collections: Collection[] = [];
    if (input.collectionIds && input.collectionIds.length > 0) {
      const uniqueCollectionIds = Array.from(new Set(input.collectionIds));
      collections = await this.collections.find({
        where: { id: In(uniqueCollectionIds) },
      });
      if (collections.length !== uniqueCollectionIds.length) {
        throw new NotFoundException(
          'One or more specified collections not found',
        );
      }
    }

    // Atomic transaction: Product + Variants + Audit Log
    return this.dataSource.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const variantRepo = manager.getRepository(ProductVariant);

      const product = productRepo.create({
        name: input.name.trim(),
        slug: input.slug.trim().toLowerCase(),
        description: input.description.trim(),
        categoryId: category.id,
        category,
        status: ProductStatus.DRAFT,
        collections,
      });

      const savedProduct = await productRepo.save(product);

      if (input.variants && input.variants.length > 0) {
        const skus = input.variants.map((v) => v.sku.toUpperCase());
        if (new Set(skus).size !== skus.length) {
          throw new BadRequestException(
            'Variant SKUs in request must be unique',
          );
        }

        const existingVariants = await variantRepo.find({
          where: { sku: In(skus) },
        });
        if (existingVariants.length > 0) {
          throw new ConflictException(
            `Variant SKU "${existingVariants[0].sku}" already exists`,
          );
        }

        const variantsToCreate = input.variants.map((v) =>
          variantRepo.create({
            productId: savedProduct.id,
            sku: v.sku.toUpperCase(),
            size: v.size.trim(),
            color: v.color.trim(),
            priceMinor: v.priceMinor,
            isActive: v.isActive ?? true,
          }),
        );

        savedProduct.variants = await variantRepo.save(variantsToCreate);
      } else {
        savedProduct.variants = [];
      }

      await this.auditService.record(
        {
          actorId,
          action: 'PRODUCT_CREATED',
          entity: 'Product',
          entityId: savedProduct.id,
          before: null,
          after: {
            name: savedProduct.name,
            slug: savedProduct.slug,
            categoryId: savedProduct.categoryId,
            status: savedProduct.status,
            variantCount: savedProduct.variants.length,
          },
        },
        manager,
      );

      return savedProduct;
    });
  }

  async updateProduct(
    actorId: string,
    id: string,
    input: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findProductById(id);
    const beforeState = {
      name: product.name,
      slug: product.slug,
      categoryId: product.categoryId,
      status: product.status,
    };

    if (input.slug && input.slug.toLowerCase() !== product.slug) {
      const existing = await this.products.findOne({
        where: { slug: input.slug.toLowerCase() },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Product with slug "${input.slug}" already exists`,
        );
      }
      product.slug = input.slug.toLowerCase().trim();
    }

    if (input.name !== undefined) {
      product.name = input.name.trim();
    }

    if (input.description !== undefined) {
      product.description = input.description.trim();
    }

    if (input.categoryId && input.categoryId !== product.categoryId) {
      const category = await this.categories.findOne({
        where: { id: input.categoryId },
      });
      if (!category) {
        throw new NotFoundException(
          `Category with ID ${input.categoryId} was not found`,
        );
      }
      product.categoryId = category.id;
      product.category = category;
    }

    if (input.status !== undefined) {
      product.status = input.status;
    }

    if (input.collectionIds !== undefined) {
      const uniqueIds = Array.from(new Set(input.collectionIds));
      if (uniqueIds.length > 0) {
        const collections = await this.collections.find({
          where: { id: In(uniqueIds) },
        });
        if (collections.length !== uniqueIds.length) {
          throw new NotFoundException(
            'One or more specified collections not found',
          );
        }
        product.collections = collections;
      } else {
        product.collections = [];
      }
    }

    const saved = await this.products.save(product);

    await this.auditService.record({
      actorId,
      action: 'PRODUCT_UPDATED',
      entity: 'Product',
      entityId: saved.id,
      before: beforeState,
      after: {
        name: saved.name,
        slug: saved.slug,
        categoryId: saved.categoryId,
        status: saved.status,
      },
    });

    return saved;
  }

  async publishProduct(actorId: string, id: string): Promise<Product> {
    const product = await this.findProductById(id);

    if (product.status === ProductStatus.PUBLISHED) {
      return product;
    }

    // Business invariant: product must have at least one active variant with priceMinor > 0
    const activeVariants = (product.variants ?? []).filter(
      (v) => v.isActive && v.priceMinor > 0,
    );

    if (activeVariants.length === 0) {
      throw new BadRequestException(
        'Product cannot be published without at least one active variant with a valid price',
      );
    }

    const beforeState = { status: product.status };
    product.status = ProductStatus.PUBLISHED;
    const saved = await this.products.save(product);

    await this.auditService.record({
      actorId,
      action: 'PRODUCT_PUBLISHED',
      entity: 'Product',
      entityId: saved.id,
      before: beforeState,
      after: {
        status: saved.status,
        activeVariantsCount: activeVariants.length,
      },
    });

    return saved;
  }

  async archiveProduct(actorId: string, id: string): Promise<Product> {
    const product = await this.findProductById(id);
    const beforeState = { status: product.status };

    product.status = ProductStatus.ARCHIVED;
    const saved = await this.products.save(product);

    await this.auditService.record({
      actorId,
      action: 'PRODUCT_ARCHIVED',
      entity: 'Product',
      entityId: saved.id,
      before: beforeState,
      after: { status: saved.status },
    });

    return saved;
  }

  // -------------------------------------------------------------
  // Staff Variant Management
  // -------------------------------------------------------------

  async findVariantsByProduct(productId: string): Promise<ProductVariant[]> {
    await this.findProductById(productId);
    return this.variants.find({
      where: { productId },
      order: { size: 'ASC', color: 'ASC' },
    });
  }

  async findVariantById(
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.variants.findOne({
      where: { id: variantId, productId },
      relations: { product: true },
    });

    if (!variant) {
      throw new NotFoundException(
        `Variant with ID ${variantId} was not found on product ${productId}`,
      );
    }

    return variant;
  }

  async createVariant(
    actorId: string,
    productId: string,
    input: CreateVariantDto,
  ): Promise<ProductVariant> {
    const product = await this.findProductById(productId);

    const existing = await this.variants.findOne({
      where: { sku: input.sku.toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(
        `Variant with SKU "${input.sku.toUpperCase()}" already exists`,
      );
    }

    const variant = this.variants.create({
      productId: product.id,
      sku: input.sku.toUpperCase().trim(),
      size: input.size.trim(),
      color: input.color.trim(),
      priceMinor: input.priceMinor,
      isActive: input.isActive ?? true,
    });

    const saved = await this.variants.save(variant);

    await this.auditService.record({
      actorId,
      action: 'VARIANT_CREATED',
      entity: 'ProductVariant',
      entityId: saved.id,
      before: null,
      after: {
        productId: saved.productId,
        sku: saved.sku,
        size: saved.size,
        color: saved.color,
        priceMinor: saved.priceMinor,
        isActive: saved.isActive,
      },
    });

    return saved;
  }

  async updateVariant(
    actorId: string,
    productId: string,
    variantId: string,
    input: UpdateVariantDto,
  ): Promise<ProductVariant> {
    const variant = await this.findVariantById(productId, variantId);

    const beforeState = {
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      priceMinor: variant.priceMinor,
      isActive: variant.isActive,
    };

    if (input.sku && input.sku.toUpperCase() !== variant.sku) {
      const existing = await this.variants.findOne({
        where: { sku: input.sku.toUpperCase() },
      });
      if (existing && existing.id !== variantId) {
        throw new ConflictException(
          `Variant with SKU "${input.sku.toUpperCase()}" already exists`,
        );
      }
      variant.sku = input.sku.toUpperCase().trim();
    }

    if (input.size !== undefined) {
      variant.size = input.size.trim();
    }

    if (input.color !== undefined) {
      variant.color = input.color.trim();
    }

    if (input.priceMinor !== undefined) {
      variant.priceMinor = input.priceMinor;
    }

    if (input.isActive !== undefined) {
      variant.isActive = input.isActive;
    }

    const saved = await this.variants.save(variant);

    await this.auditService.record({
      actorId,
      action:
        beforeState.priceMinor !== saved.priceMinor
          ? 'VARIANT_PRICE_CHANGED'
          : 'VARIANT_UPDATED',
      entity: 'ProductVariant',
      entityId: saved.id,
      before: beforeState,
      after: {
        sku: saved.sku,
        size: saved.size,
        color: saved.color,
        priceMinor: saved.priceMinor,
        isActive: saved.isActive,
      },
    });

    return saved;
  }

  async deleteVariant(
    actorId: string,
    productId: string,
    variantId: string,
  ): Promise<{ deactivated: boolean; id: string }> {
    const variant = await this.findVariantById(productId, variantId);
    const beforeState = { isActive: variant.isActive };

    variant.isActive = false;
    await this.variants.save(variant);

    await this.auditService.record({
      actorId,
      action: 'VARIANT_DEACTIVATED',
      entity: 'ProductVariant',
      entityId: variant.id,
      before: beforeState,
      after: { isActive: false },
    });

    return { deactivated: true, id: variant.id };
  }
}
