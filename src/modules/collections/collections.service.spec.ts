import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { Product, ProductStatus } from '../catalog/entities/product.entity';
import type { Category } from '../categories/entities/category.entity';
import { CollectionsService } from './collections.service';
import type { Collection } from './entities/collection.entity';

describe('CollectionsService', () => {
  let service: CollectionsService;
  let mockCollectionRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockProductRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
  };

  const mockProduct: Product = {
    id: '22222222-2222-2222-2222-222222222222',
    categoryId: '11111111-1111-1111-1111-111111111111',
    name: 'Linen Shirt',
    slug: 'linen-shirt',
    description: 'A breathable linen shirt',
    status: ProductStatus.PUBLISHED,
    category: null as unknown as Category,
    variants: [],
    collections: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCollection: Collection = {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Summer 2026',
    slug: 'summer-2026',
    isActive: true,
    products: [mockProduct],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockCollectionRepo = {
      findOne: jest.fn(),
      create: jest.fn((c: Partial<Collection>) => c as Collection),
      save: jest.fn((c: Partial<Collection>) =>
        Promise.resolve({ id: mockCollection.id, ...c } as Collection),
      ),
      remove: jest.fn().mockResolvedValue(mockCollection),
      createQueryBuilder: jest.fn(),
    };

    mockProductRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    service = new CollectionsService(
      mockCollectionRepo as unknown as Repository<Collection>,
      mockProductRepo as unknown as Repository<Product>,
    );
  });

  describe('create', () => {
    it('creates a new collection without products', async () => {
      mockCollectionRepo.findOne.mockResolvedValue(null);

      const result = await service.create({
        name: 'Summer 2026',
        slug: 'summer-2026',
        isActive: true,
      });

      expect(result.slug).toBe('summer-2026');
      expect(mockCollectionRepo.save).toHaveBeenCalled();
    });

    it('creates a new collection with assigned products', async () => {
      mockCollectionRepo.findOne.mockResolvedValue(null);
      mockProductRepo.find.mockResolvedValue([mockProduct]);

      const result = await service.create({
        name: 'Summer 2026',
        slug: 'summer-2026',
        productIds: [mockProduct.id],
      });

      expect(result.products).toEqual([mockProduct]);
    });

    it('throws NotFoundException if specified product does not exist', async () => {
      mockCollectionRepo.findOne.mockResolvedValue(null);
      mockProductRepo.find.mockResolvedValue([]); // zero products found

      await expect(
        service.create({
          name: 'Summer 2026',
          slug: 'summer-2026',
          productIds: ['non-existent-id'],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when slug already exists', async () => {
      mockCollectionRepo.findOne.mockResolvedValue(mockCollection);

      await expect(
        service.create({
          name: 'Summer 2026',
          slug: 'summer-2026',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findById', () => {
    it('returns collection with relations', async () => {
      mockCollectionRepo.findOne.mockResolvedValue(mockCollection);

      const result = await service.findById(mockCollection.id);
      expect(result).toEqual(mockCollection);
    });

    it('throws NotFoundException if not found', async () => {
      mockCollectionRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates collection details', async () => {
      mockCollectionRepo.findOne
        .mockResolvedValueOnce(mockCollection)
        .mockResolvedValueOnce(null);

      const result = await service.update(mockCollection.id, {
        name: 'Summer 2026 Edition',
      });

      expect(result.name).toBe('Summer 2026 Edition');
    });

    it('throws ConflictException on slug clash', async () => {
      mockCollectionRepo.findOne
        .mockResolvedValueOnce(mockCollection)
        .mockResolvedValueOnce({ ...mockCollection, id: 'different-id' });

      await expect(
        service.update(mockCollection.id, { slug: 'different-slug' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('addProduct', () => {
    it('adds product to collection', async () => {
      const emptyCollection: Collection = {
        ...mockCollection,
        products: [],
      };
      mockCollectionRepo.findOne.mockResolvedValue(emptyCollection);
      mockProductRepo.findOne.mockResolvedValue(mockProduct);

      const result = await service.addProduct(
        emptyCollection.id,
        mockProduct.id,
      );
      expect(result.products).toContain(mockProduct);
    });

    it('throws ConflictException if product already in collection', async () => {
      mockCollectionRepo.findOne.mockResolvedValue(mockCollection);
      mockProductRepo.findOne.mockResolvedValue(mockProduct);

      await expect(
        service.addProduct(mockCollection.id, mockProduct.id),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('removeProduct', () => {
    it('removes product from collection', async () => {
      mockCollectionRepo.findOne.mockResolvedValue({
        ...mockCollection,
        products: [mockProduct],
      });

      const result = await service.removeProduct(
        mockCollection.id,
        mockProduct.id,
      );
      expect(result.products).toHaveLength(0);
    });

    it('throws NotFoundException if product not in collection', async () => {
      mockCollectionRepo.findOne.mockResolvedValue({
        ...mockCollection,
        products: [],
      });

      await expect(
        service.removeProduct(mockCollection.id, mockProduct.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('removes collection', async () => {
      mockCollectionRepo.findOne.mockResolvedValue(mockCollection);

      const result = await service.delete(mockCollection.id);
      expect(result).toEqual({ deleted: true, id: mockCollection.id });
    });
  });
});
