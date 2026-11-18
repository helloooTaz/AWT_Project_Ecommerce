import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { Product } from '../catalog/entities/product.entity';
import { CategoriesService } from './categories.service';
import type { Category } from './entities/category.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockCategoryRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockProductRepo: {
    count: jest.Mock;
  };

  const mockCategory: Category = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Footwear',
    slug: 'footwear',
    isActive: true,
  };

  beforeEach(() => {
    mockCategoryRepo = {
      findOne: jest.fn(),
      create: jest.fn((c: Partial<Category>) => c as Category),
      save: jest.fn((c: Partial<Category>) =>
        Promise.resolve({ id: mockCategory.id, ...c } as Category),
      ),
      remove: jest.fn().mockResolvedValue(mockCategory),
      createQueryBuilder: jest.fn(),
    };

    mockProductRepo = {
      count: jest.fn(),
    };

    service = new CategoriesService(
      mockCategoryRepo as unknown as Repository<Category>,
      mockProductRepo as unknown as Repository<Product>,
    );
  });

  describe('create', () => {
    it('creates a new category when slug is unique', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      const result = await service.create({
        name: 'Footwear',
        slug: 'footwear',
        isActive: true,
      });

      expect(result.slug).toBe('footwear');
      expect(mockCategoryRepo.findOne).toHaveBeenCalledWith({
        where: { slug: 'footwear' },
      });
      expect(mockCategoryRepo.save).toHaveBeenCalled();
    });

    it('throws ConflictException when slug already exists', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(mockCategory);

      await expect(
        service.create({
          name: 'Footwear',
          slug: 'footwear',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findById', () => {
    it('returns category if found', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(mockCategory);

      const result = await service.findById(mockCategory.id);
      expect(result).toEqual(mockCategory);
    });

    it('throws NotFoundException if not found', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findBySlug', () => {
    it('returns category if found by slug', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(mockCategory);

      const result = await service.findBySlug('footwear');
      expect(result).toEqual(mockCategory);
    });

    it('throws NotFoundException if slug not found', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(service.findBySlug('unknown-slug')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates category successfully', async () => {
      mockCategoryRepo.findOne
        .mockResolvedValueOnce(mockCategory) // findById
        .mockResolvedValueOnce(null); // slug check

      const result = await service.update(mockCategory.id, {
        name: 'Updated Footwear',
      });

      expect(result.name).toBe('Updated Footwear');
    });

    it('throws ConflictException when updating to an existing slug', async () => {
      mockCategoryRepo.findOne
        .mockResolvedValueOnce(mockCategory) // findById
        .mockResolvedValueOnce({ ...mockCategory, id: 'different-id' }); // slug exists on other

      await expect(
        service.update(mockCategory.id, { slug: 'different-slug' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('deletes category when no products are assigned', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(mockCategory);
      mockProductRepo.count.mockResolvedValue(0);

      const result = await service.delete(mockCategory.id);
      expect(result).toEqual({ deleted: true, id: mockCategory.id });
    });

    it('throws ConflictException when products are assigned', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(mockCategory);
      mockProductRepo.count.mockResolvedValue(3);

      await expect(service.delete(mockCategory.id)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated categories with metadata', async () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockCategory], 1]),
      };
      mockCategoryRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.items).toEqual([mockCategory]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });
  });
});
