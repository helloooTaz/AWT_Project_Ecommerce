import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../catalog/entities/product.entity';
import { Category } from './entities/category.entity';
import type { CategoryQueryDto } from './dto/category-query.dto';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  async findAll(query: CategoryQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.categories.createQueryBuilder('category');

    if (query.isActive !== undefined) {
      qb.andWhere('category.isActive = :isActive', {
        isActive: query.isActive,
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        '(category.name ILIKE :search OR category.slug ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    qb.orderBy('category.name', 'ASC').skip(skip).take(limit);

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

  async findById(id: string): Promise<Category> {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} was not found`);
    }
    return category;
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categories.findOne({ where: { slug } });
    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" was not found`);
    }
    return category;
  }

  async create(input: CreateCategoryDto): Promise<Category> {
    const existing = await this.categories.findOne({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new ConflictException(
        `Category with slug "${input.slug}" already exists`,
      );
    }

    const category = this.categories.create({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      isActive: input.isActive ?? true,
    });

    return this.categories.save(category);
  }

  async update(id: string, input: UpdateCategoryDto): Promise<Category> {
    const category = await this.findById(id);

    if (input.slug && input.slug.toLowerCase() !== category.slug) {
      const existing = await this.categories.findOne({
        where: { slug: input.slug.toLowerCase() },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Category with slug "${input.slug}" already exists`,
        );
      }
      category.slug = input.slug.toLowerCase().trim();
    }

    if (input.name !== undefined) {
      category.name = input.name.trim();
    }

    if (input.isActive !== undefined) {
      category.isActive = input.isActive;
    }

    return this.categories.save(category);
  }

  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    const category = await this.findById(id);

    const linkedProductsCount = await this.products.count({
      where: { categoryId: id },
    });

    if (linkedProductsCount > 0) {
      throw new ConflictException(
        `Cannot delete category "${category.name}" because ${linkedProductsCount} product(s) are assigned to it`,
      );
    }

    await this.categories.remove(category);
    return { deleted: true, id };
  }
}
