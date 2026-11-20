import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Page, type PageQueryDto } from '../../common/http/pagination';
import { Category, Collection } from '../../database/entities';
import type {
  CreateCategoryDto, CreateCollectionDto, UpdateCategoryDto, UpdateCollectionDto,
} from './catalog.dto';

@Injectable()
export class CatalogEntriesService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(Collection) private readonly collections: Repository<Collection>,
    private readonly dataSource: DataSource,
  ) {}

  createCategory(input: CreateCategoryDto): Promise<Category> {
    return this.categories.save(this.categories.create({ ...input, description: input.description ?? null }));
  }

  async listCategories(query: PageQueryDto): Promise<Page<Category>> {
    const [rows, total] = await this.categories.findAndCount({
      order: { slug: 'ASC', id: 'ASC' }, skip: (query.page - 1) * query.limit, take: query.limit,
    });
    return new Page(rows, total, query);
  }

  async getCategory(id: string): Promise<Category> {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async updateCategory(id: string, input: UpdateCategoryDto): Promise<Category> {
    if (!Object.keys(input).length) return this.getCategory(id);
    const result = await this.categories.update({ id }, input, { returning: '*' });
    const [updated]: Category[] = result.raw;
    if (!updated) throw new NotFoundException('Category not found');
    return updated;
  }

  async deleteCategory(id: string): Promise<void> {
    const deleted = await this.categories.delete({ id });
    if (!deleted.affected) throw new NotFoundException('Category not found');
  }

  createCollection(input: CreateCollectionDto): Promise<Collection> {
    return this.collections.save(this.collections.create({ ...input, description: input.description ?? null }));
  }

  async listCollections(query: PageQueryDto): Promise<Page<Collection>> {
    const [rows, total] = await this.collections.findAndCount({
      order: { slug: 'ASC', id: 'ASC' }, skip: (query.page - 1) * query.limit, take: query.limit,
    });
    return new Page(rows, total, query);
  }

  async getCollection(id: string): Promise<Collection> {
    const collection = await this.collections.findOneBy({ id });
    if (!collection) throw new NotFoundException('Collection not found');
    return collection;
  }

  async updateCollection(id: string, input: UpdateCollectionDto): Promise<Collection> {
    if (!Object.keys(input).length) return this.getCollection(id);
    const result = await this.collections.update({ id }, input, { returning: '*' });
    const [updated]: Collection[] = result.raw;
    if (!updated) throw new NotFoundException('Collection not found');
    return updated;
  }

  deleteCollection(id: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const collections = manager.getRepository(Collection);
      const collection = await collections.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!collection) throw new NotFoundException('Collection not found');
      // Lock the collection before clearing memberships so a new FK reference cannot slip in.
      await manager.createQueryBuilder().delete().from('product_collections')
        .where('"collectionId" = :id', { id }).execute();
      await collections.delete({ id });
    });
  }
}
