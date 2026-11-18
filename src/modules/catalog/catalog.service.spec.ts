import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuditService } from '../audit/audit.service';
import type { Category } from '../categories/entities/category.entity';
import type { Collection } from '../collections/entities/collection.entity';
import { CatalogService } from './catalog.service';
import { ProductVariant } from './entities/product-variant.entity';
import { Product, ProductStatus } from './entities/product.entity';

describe('CatalogService', () => {
  let service: CatalogService;
  let mockProductRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockVariantRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    manager: { getRepository: jest.Mock };
  };
  let mockCategoryRepo: {
    findOne: jest.Mock;
  };
  let mockCollectionRepo: {
    find: jest.Mock;
  };
  let mockAuditService: {
    record: jest.Mock;
  };
  let mockDataSource: {
    transaction: jest.Mock;
  };

  const mockCategory: Category = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Tops',
    slug: 'tops',
    isActive: true,
  };

  const mockVariant: ProductVariant = {
    id: '22222222-2222-2222-2222-222222222222',
    productId: '33333333-3333-3333-3333-333333333333',
    sku: 'SHIRT-LINEN-M',
    size: 'M',
    color: 'White',
    priceMinor: 250000,
    isActive: true,
    product: null as unknown as Product,
  };

  const mockProduct: Product = {
    id: '33333333-3333-3333-3333-333333333333',
    categoryId: mockCategory.id,
    name: 'Linen Shirt',
    slug: 'linen-shirt',
    description: '100% pure linen shirt',
    status: ProductStatus.DRAFT,
    category: mockCategory,
    variants: [mockVariant],
    collections: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockProductRepo = {
      findOne: jest.fn(),
      create: jest.fn((p: Partial<Product>) => p as Product),
      save: jest.fn((p: Partial<Product>) =>
        Promise.resolve({ id: mockProduct.id, ...p } as Product),
      ),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockVariantRepo = {
      findOne: jest.fn(),
      create: jest.fn((v: Partial<ProductVariant>) => v as ProductVariant),
      save: jest.fn((v: Partial<ProductVariant>) =>
        Promise.resolve({ id: mockVariant.id, ...v } as ProductVariant),
      ),
      find: jest.fn(),
      manager: {
        getRepository: jest.fn(),
      },
    };

    mockCategoryRepo = {
      findOne: jest.fn(),
    };

    mockCollectionRepo = {
      find: jest.fn(),
    };

    mockAuditService = {
      record: jest.fn().mockResolvedValue({ id: 'audit-id' }),
    };

    mockDataSource = {
      transaction: jest.fn(
        (cb: (manager: EntityManager) => Promise<unknown>) => {
          const mockManager = {
            getRepository: jest.fn((entity: unknown) => {
              if (entity === Product) return mockProductRepo;
              if (entity === ProductVariant) return mockVariantRepo;
              return {};
            }),
          } as unknown as EntityManager;
          return cb(mockManager);
        },
      ),
    };

    service = new CatalogService(
      mockProductRepo as unknown as Repository<Product>,
      mockVariantRepo as unknown as Repository<ProductVariant>,
      mockCategoryRepo as unknown as Repository<Category>,
      mockCollectionRepo as unknown as Repository<Collection>,
      mockAuditService as unknown as AuditService,
      mockDataSource as unknown as DataSource,
    );
  });

  describe('createProduct', () => {
    it('creates product in DRAFT and records audit log', async () => {
      mockProductRepo.findOne.mockResolvedValue(null);
      mockCategoryRepo.findOne.mockResolvedValue(mockCategory);

      const result = await service.createProduct('staff-id', {
        name: 'Linen Shirt',
        slug: 'linen-shirt',
        description: 'Quality French linen shirt',
        categoryId: mockCategory.id,
      });

      expect(result.slug).toBe('linen-shirt');
      expect(result.status).toBe(ProductStatus.DRAFT);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_CREATED',
          entity: 'Product',
        }),
        expect.anything(),
      );
    });

    it('throws ConflictException when product slug already exists', async () => {
      mockProductRepo.findOne.mockResolvedValue(mockProduct);

      await expect(
        service.createProduct('staff-id', {
          name: 'Linen Shirt',
          slug: 'linen-shirt',
          description: 'A linen shirt description',
          categoryId: mockCategory.id,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when category does not exist', async () => {
      mockProductRepo.findOne.mockResolvedValue(null);
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createProduct('staff-id', {
          name: 'Linen Shirt',
          slug: 'linen-shirt',
          description: 'A linen shirt description',
          categoryId: 'non-existent-cat',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('publishProduct', () => {
    it('publishes product when active variants with price exist', async () => {
      mockProductRepo.findOne.mockResolvedValue({
        ...mockProduct,
        status: ProductStatus.DRAFT,
        variants: [mockVariant],
      });

      const result = await service.publishProduct('staff-id', mockProduct.id);
      expect(result.status).toBe(ProductStatus.PUBLISHED);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_PUBLISHED',
          entity: 'Product',
        }),
      );
    });

    it('throws BadRequestException if product has no active variants', async () => {
      mockProductRepo.findOne.mockResolvedValue({
        ...mockProduct,
        status: ProductStatus.DRAFT,
        variants: [], // no variants
      });

      await expect(
        service.publishProduct('staff-id', mockProduct.id),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('archiveProduct', () => {
    it('sets product status to ARCHIVED and records audit log', async () => {
      mockProductRepo.findOne.mockResolvedValue(mockProduct);

      const result = await service.archiveProduct('staff-id', mockProduct.id);
      expect(result.status).toBe(ProductStatus.ARCHIVED);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_ARCHIVED',
        }),
      );
    });
  });

  describe('createVariant', () => {
    it('creates variant and records audit log', async () => {
      mockProductRepo.findOne.mockResolvedValue(mockProduct);
      mockVariantRepo.findOne.mockResolvedValue(null);

      const result = await service.createVariant('staff-id', mockProduct.id, {
        sku: 'SHIRT-LINEN-L',
        size: 'L',
        color: 'White',
        priceMinor: 260000,
      });

      expect(result.sku).toBe('SHIRT-LINEN-L');
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VARIANT_CREATED',
          entity: 'ProductVariant',
        }),
      );
    });

    it('throws ConflictException if SKU already exists', async () => {
      mockProductRepo.findOne.mockResolvedValue(mockProduct);
      mockVariantRepo.findOne.mockResolvedValue(mockVariant);

      await expect(
        service.createVariant('staff-id', mockProduct.id, {
          sku: 'SHIRT-LINEN-M',
          size: 'M',
          color: 'White',
          priceMinor: 250000,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateVariant', () => {
    it('audits price change with VARIANT_PRICE_CHANGED', async () => {
      mockVariantRepo.findOne.mockResolvedValue({
        ...mockVariant,
        priceMinor: 250000,
      });

      await service.updateVariant('staff-id', mockProduct.id, mockVariant.id, {
        priceMinor: 280000,
      });

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VARIANT_PRICE_CHANGED',
          entity: 'ProductVariant',
        }),
      );
    });
  });

  describe('deleteVariant', () => {
    it('deactivates variant and records audit log', async () => {
      mockVariantRepo.findOne.mockResolvedValue({
        ...mockVariant,
        isActive: true,
      });

      const result = await service.deleteVariant(
        'staff-id',
        mockProduct.id,
        mockVariant.id,
      );

      expect(result.deactivated).toBe(true);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VARIANT_DEACTIVATED',
          entity: 'ProductVariant',
        }),
      );
    });
  });

  describe('validateVariantExists', () => {
    it('returns variant if found', async () => {
      mockVariantRepo.findOne.mockResolvedValue(mockVariant);

      const result = await service.validateVariantExists(mockVariant.id);
      expect(result).toEqual(mockVariant);
    });

    it('throws NotFoundException if variant missing', async () => {
      mockVariantRepo.findOne.mockResolvedValue(null);

      await expect(
        service.validateVariantExists('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
