import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { Product, ProductStatus } from '../catalog/entities/product.entity';
import type { Category } from '../categories/entities/category.entity';
import type { SizeGuideRange } from './entities/size-guide-range.entity';
import { SizeGuide } from './entities/size-guide.entity';
import { SizeGuidesService } from './size-guides.service';

describe('SizeGuidesService', () => {
  let service: SizeGuidesService;
  let mockGuideRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let mockRangeRepo: {
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let mockProductRepo: {
    findOne: jest.Mock;
  };
  let mockDataSource: {
    transaction: jest.Mock;
  };

  const mockProduct: Product = {
    id: '11111111-1111-1111-1111-111111111111',
    categoryId: '22222222-2222-2222-2222-222222222222',
    name: 'T-Shirt',
    slug: 't-shirt',
    description: 'Cotton T-Shirt',
    status: ProductStatus.PUBLISHED,
    category: null as unknown as Category,
    variants: [],
    collections: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockGuide: SizeGuide = {
    id: '33333333-3333-3333-3333-333333333333',
    productId: mockProduct.id,
    product: mockProduct,
    name: 'Standard Tops',
    measurementUnit: 'cm',
    ranges: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockGuideRepo = {
      findOne: jest.fn(),
      create: jest.fn((g: Partial<SizeGuide>) => g as SizeGuide),
      save: jest.fn((g: Partial<SizeGuide>) =>
        Promise.resolve({ id: mockGuide.id, ...g } as SizeGuide),
      ),
      remove: jest.fn().mockResolvedValue(mockGuide),
    };

    mockRangeRepo = {
      create: jest.fn((r: Partial<SizeGuideRange>) => r as SizeGuideRange),
      save: jest.fn((ranges: unknown) => Promise.resolve(ranges)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockProductRepo = {
      findOne: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn(
        (cb: (manager: EntityManager) => Promise<unknown>) => {
          const mockManager = {
            getRepository: jest.fn((entity: unknown) => {
              if (entity === SizeGuide) return mockGuideRepo;
              return mockRangeRepo;
            }),
          } as unknown as EntityManager;
          return cb(mockManager);
        },
      ),
    };

    service = new SizeGuidesService(
      mockGuideRepo as unknown as Repository<SizeGuide>,
      mockRangeRepo as unknown as Repository<SizeGuideRange>,
      mockProductRepo as unknown as Repository<Product>,
      mockDataSource as unknown as DataSource,
    );
  });

  describe('findByProductId', () => {
    it('returns size guide if found', async () => {
      mockGuideRepo.findOne.mockResolvedValue(mockGuide);

      const result = await service.findByProductId(mockProduct.id);
      expect(result).toEqual(mockGuide);
    });

    it('throws NotFoundException if not found', async () => {
      mockGuideRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findByProductId('non-existent-product'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates size guide with ranges', async () => {
      mockProductRepo.findOne.mockResolvedValue(mockProduct);
      mockGuideRepo.findOne.mockResolvedValue(null);

      const result = await service.create(mockProduct.id, {
        name: 'Standard Tops',
        ranges: [
          {
            size: 'M',
            minHeightCm: 170,
            maxHeightCm: 180,
            minWeightKg: 65,
            maxWeightKg: 75,
          },
        ],
      });

      expect(result.name).toBe('Standard Tops');
      expect(mockGuideRepo.save).toHaveBeenCalled();
    });

    it('throws ConflictException if product already has size guide', async () => {
      mockProductRepo.findOne.mockResolvedValue(mockProduct);
      mockGuideRepo.findOne.mockResolvedValue(mockGuide);

      await expect(
        service.create(mockProduct.id, {
          name: 'Standard Tops',
          ranges: [{ size: 'M', minHeightCm: 170, maxHeightCm: 180 }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if minHeightCm > maxHeightCm', async () => {
      mockProductRepo.findOne.mockResolvedValue(mockProduct);
      mockGuideRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(mockProduct.id, {
          name: 'Standard Tops',
          ranges: [{ size: 'M', minHeightCm: 180, maxHeightCm: 170 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('deletes size guide successfully', async () => {
      mockGuideRepo.findOne.mockResolvedValue(mockGuide);

      const result = await service.delete(mockProduct.id);
      expect(result).toEqual({ deleted: true, productId: mockProduct.id });
    });
  });
});
