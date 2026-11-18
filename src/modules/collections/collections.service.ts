import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../catalog/entities/product.entity';
import type { CollectionQueryDto } from './dto/collection-query.dto';
import type { CreateCollectionDto } from './dto/create-collection.dto';
import type { UpdateCollectionDto } from './dto/update-collection.dto';
import { Collection } from './entities/collection.entity';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(Collection)
    private readonly collections: Repository<Collection>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  async findAll(query: CollectionQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.collections
      .createQueryBuilder('collection')
      .leftJoinAndSelect('collection.products', 'product');

    if (query.isActive !== undefined) {
      qb.andWhere('collection.isActive = :isActive', {
        isActive: query.isActive,
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        '(collection.name ILIKE :search OR collection.slug ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    qb.orderBy('collection.name', 'ASC').skip(skip).take(limit);

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

  async findById(id: string): Promise<Collection> {
    const collection = await this.collections.findOne({
      where: { id },
      relations: {
        products: {
          category: true,
          variants: true,
        },
      },
    });

    if (!collection) {
      throw new NotFoundException(`Collection with ID ${id} was not found`);
    }

    return collection;
  }

  async findBySlug(slug: string): Promise<Collection> {
    const collection = await this.collections.findOne({
      where: { slug },
      relations: {
        products: {
          category: true,
          variants: true,
        },
      },
    });

    if (!collection) {
      throw new NotFoundException(
        `Collection with slug "${slug}" was not found`,
      );
    }

    return collection;
  }

  async create(input: CreateCollectionDto): Promise<Collection> {
    const existing = await this.collections.findOne({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new ConflictException(
        `Collection with slug "${input.slug}" already exists`,
      );
    }

    let assignedProducts: Product[] = [];
    if (input.productIds && input.productIds.length > 0) {
      const uniqueIds = Array.from(new Set(input.productIds));
      assignedProducts = await this.products.find({
        where: { id: In(uniqueIds) },
      });
      if (assignedProducts.length !== uniqueIds.length) {
        throw new NotFoundException('One or more specified products not found');
      }
    }

    const collection = this.collections.create({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description?.trim() ?? null,
      isActive: input.isActive ?? true,
      products: assignedProducts,
    });

    return this.collections.save(collection);
  }

  async update(id: string, input: UpdateCollectionDto): Promise<Collection> {
    const collection = await this.findById(id);

    if (input.slug && input.slug.toLowerCase() !== collection.slug) {
      const existing = await this.collections.findOne({
        where: { slug: input.slug.toLowerCase() },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Collection with slug "${input.slug}" already exists`,
        );
      }
      collection.slug = input.slug.toLowerCase().trim();
    }

    if (input.name !== undefined) {
      collection.name = input.name.trim();
    }

    if (input.description !== undefined) {
      collection.description = input.description.trim();
    }

    if (input.isActive !== undefined) {
      collection.isActive = input.isActive;
    }

    if (input.productIds !== undefined) {
      const uniqueIds = Array.from(new Set(input.productIds));
      if (uniqueIds.length > 0) {
        const assignedProducts = await this.products.find({
          where: { id: In(uniqueIds) },
        });
        if (assignedProducts.length !== uniqueIds.length) {
          throw new NotFoundException(
            'One or more specified products not found',
          );
        }
        collection.products = assignedProducts;
      } else {
        collection.products = [];
      }
    }

    return this.collections.save(collection);
  }

  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    const collection = await this.findById(id);
    await this.collections.remove(collection);
    return { deleted: true, id };
  }

  async addProduct(
    collectionId: string,
    productId: string,
  ): Promise<Collection> {
    const collection = await this.findById(collectionId);
    const product = await this.products.findOne({ where: { id: productId } });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} was not found`);
    }

    const alreadyInCollection = collection.products.some(
      (p) => p.id === productId,
    );
    if (alreadyInCollection) {
      throw new ConflictException(
        `Product is already part of collection "${collection.name}"`,
      );
    }

    collection.products.push(product);
    return this.collections.save(collection);
  }

  async removeProduct(
    collectionId: string,
    productId: string,
  ): Promise<Collection> {
    const collection = await this.findById(collectionId);

    const existsInCollection = collection.products.some(
      (p) => p.id === productId,
    );
    if (!existsInCollection) {
      throw new NotFoundException(
        `Product is not in collection "${collection.name}"`,
      );
    }

    collection.products = collection.products.filter((p) => p.id !== productId);
    return this.collections.save(collection);
  }
}
