import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import { ProductVariant } from '../../src/modules/catalog/entities/product-variant.entity';
import {
  Product,
  ProductStatus,
} from '../../src/modules/catalog/entities/product.entity';
import { Category } from '../../src/modules/categories/entities/category.entity';
import { InventoryBalance } from '../../src/modules/inventory/entities/inventory-balance.entity';
import { SizeGuideRange } from '../../src/modules/size-guides/entities/size-guide-range.entity';
import { SizeGuide } from '../../src/modules/size-guides/entities/size-guide.entity';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;
const measurements = { heightCm: 175, weightKg: 70 };
const medium = {
  size: 'M',
  minHeightCm: '165.00',
  maxHeightCm: '180.00',
  minWeightKg: '60.00',
  maxWeightKg: '76.00',
  minChestCm: '90.00',
  maxChestCm: '100.00',
  minWaistCm: '76.00',
  maxWaistCm: '86.00',
  minHipCm: '92.00',
  maxHipCm: '102.00',
};
const large = {
  size: 'L',
  minHeightCm: '173.00',
  maxHeightCm: '188.00',
  minWeightKg: '68.00',
  maxWeightKg: '85.00',
  minChestCm: '98.00',
  maxChestCm: '110.00',
  minWaistCm: '82.00',
  maxWaistCm: '94.00',
  minHipCm: '100.00',
  maxHipCm: '110.00',
};

describeWithPostgres('Size recommendations with PostgreSQL', () => {
  let app: INestApplication<Server>;
  let db: DataSource;
  let categoryId: string;
  let product: Product;
  const variantIds: string[] = [];

  function recommend(body: object, productId = product.id) {
    return request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/size-recommendation`)
      .send(body);
  }

  async function createGuide(ranges: Partial<SizeGuideRange>[]) {
    const guide = await db.getRepository(SizeGuide).save({
      productId: product.id,
      name: 'Relaxed cotton shirt body measurements',
    });
    await db
      .getRepository(SizeGuideRange)
      .save(ranges.map((range) => ({ ...range, sizeGuideId: guide.id })));
    return guide;
  }

  async function createVariant(size: string, color: string, isActive = true) {
    const variant = await db.getRepository(ProductVariant).save({
      productId: product.id,
      sku: `SHIRT-${randomUUID()}`,
      size,
      color,
      priceMinor: 125000,
      isActive,
    });
    variantIds.push(variant.id);
    return variant;
  }

  beforeAll(async () => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: randomBytes(32).toString('hex'),
    });
    const { AppModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    configureApp(app, true);
    await app.init();
    db = app.get(DataSource);
    if (await db.showMigrations()) {
      throw new Error('Apply migrations to TEST_DATABASE_URL before testing');
    }
    const category = await db.getRepository(Category).save({
      name: 'Shirts',
      slug: `size-test-shirts-${randomUUID()}`,
    });
    categoryId = category.id;
  }, 20000);

  beforeEach(async () => {
    product = await db.getRepository(Product).save({
      name: 'Relaxed Cotton Shirt',
      slug: `size-test-shirt-${randomUUID()}`,
      description: 'A lightweight cotton shirt',
      categoryId,
      status: ProductStatus.PUBLISHED,
    });
  });

  afterEach(async () => {
    if (variantIds.length) {
      await db
        .getRepository(InventoryBalance)
        .delete({ variantId: In(variantIds) });
      await db.getRepository(ProductVariant).delete({ id: In(variantIds) });
      variantIds.length = 0;
    }
    await db.getRepository(Product).delete(product.id);
  });

  afterAll(async () => {
    if (categoryId) await db.getRepository(Category).delete(categoryId);
    await app?.close();
    jest.restoreAllMocks();
  });

  it('recommends a size publicly from height and weight even with zero available stock', async () => {
    await createGuide([medium]);
    await createVariant('M', 'Blue');

    const response = await recommend(measurements).expect(200);
    const requestId: unknown = expect.any(String);
    expect(response.body).toEqual({
      success: true,
      message: 'OK',
      data: {
        productId: product.id,
        status: 'RECOMMENDED',
        recommendedSize: 'M',
        bestFitSize: 'M',
        matchedMeasurements: ['height', 'weight'],
        confidence: 'LOW',
        reason:
          'Size M fits the compared measurements. This estimate uses limited measurements.',
        alternatives: [],
        availableSizes: ['M'],
        variantAvailable: true,
        stockAvailable: false,
      },
      meta: { requestId },
    });
  });

  it('compares additional measurements and checks unreserved stock across active colors', async () => {
    await createGuide([large, medium]);
    const blue = await createVariant('M', 'Blue');
    const cream = await createVariant('M', 'Cream');
    await createVariant('L', 'Blue');
    const inactive = await createVariant('M', 'Black', false);
    await db.getRepository(InventoryBalance).save([
      { variantId: blue.id, onHand: 2, reserved: 2 },
      { variantId: cream.id, onHand: 3, reserved: 2 },
      { variantId: inactive.id, onHand: 5, reserved: 0 },
    ]);
    const body = { ...measurements, chestCm: 98.25, waistCm: 82, hipCm: 100 };

    const response = await recommend(body).expect(200);
    expect(response.body).toMatchObject({
      data: {
        recommendedSize: 'M',
        matchedMeasurements: ['height', 'weight', 'chest', 'waist', 'hip'],
        confidence: 'MODERATE',
        alternatives: ['L'],
        availableSizes: ['L', 'M'],
        variantAvailable: true,
        stockAvailable: true,
      },
    });

    const stock = db.getRepository(InventoryBalance);
    expect(await stock.findOneByOrFail({ variantId: cream.id })).toMatchObject({
      onHand: 3,
      reserved: 2,
    });
    await stock.update({ variantId: cream.id }, { reserved: 3 });
    await recommend(body)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          data: { recommendedSize: 'M', stockAvailable: false },
        });
      });
  });

  it.each([false, true])(
    'reports an unavailable best fit without substitution (inactive variant: %s)',
    async (inactiveVariant) => {
      await createGuide([medium, large]);
      await createVariant('L', 'Cream');
      if (inactiveVariant) await createVariant('M', 'Blue', false);

      const response = await recommend(measurements).expect(200);
      expect(response.body).toMatchObject({
        data: {
          status: 'NO_ACTIVE_VARIANT',
          recommendedSize: null,
          bestFitSize: 'M',
          alternatives: ['L'],
          availableSizes: ['L'],
          variantAvailable: false,
          stockAvailable: false,
        },
      });
    },
  );

  it('reports when supplied measurements fall outside every range', async () => {
    await createGuide([medium, large]);
    await createVariant('M', 'Blue');
    const response = await recommend({ ...measurements, chestCm: 113 }).expect(
      200,
    );
    expect(response.body).toMatchObject({
      data: {
        status: 'NO_MATCH',
        recommendedSize: null,
        bestFitSize: null,
        alternatives: [],
      },
    });
  });

  it('reports absent or empty guides', async () => {
    for (const hasGuide of [false, true]) {
      if (hasGuide) await createGuide([]);
      const response = await recommend(measurements).expect(200);
      expect(response.body).toMatchObject({
        data: {
          status: 'NO_GUIDE',
          recommendedSize: null,
          matchedMeasurements: [],
        },
      });
    }
  });

  it('uses only the requested product’s guide and active variants', async () => {
    const guide = await createGuide([medium]);
    const other = await db.getRepository(Product).save({
      name: 'Slim Cotton Shirt',
      slug: `size-test-shirt-${randomUUID()}`,
      description: 'A slim-fit cotton shirt',
      categoryId,
      status: ProductStatus.PUBLISHED,
    });
    try {
      await db
        .getRepository(SizeGuide)
        .update(guide.id, { productId: other.id });
      await createVariant('M', 'Blue');
      const current = await recommend(measurements).expect(200);
      expect(current.body).toMatchObject({ data: { status: 'NO_GUIDE' } });
      const otherResponse = await recommend(measurements, other.id).expect(200);
      expect(otherResponse.body).toMatchObject({
        data: {
          productId: other.id,
          status: 'NO_ACTIVE_VARIANT',
          bestFitSize: 'M',
          availableSizes: [],
        },
      });
    } finally {
      await db.getRepository(Product).delete(other.id);
    }
  });

  it('requests a relevant optional measurement when the guide lacks height and weight bounds', async () => {
    await createGuide([{ size: 'M', minHipCm: '94.50', maxHipCm: '102.00' }]);
    await createVariant('M', 'Blue');
    const insufficient = await recommend(measurements).expect(200);
    expect(insufficient.body).toMatchObject({
      data: { status: 'INSUFFICIENT_MEASUREMENTS', recommendedSize: null },
    });
    const sufficient = await recommend({ ...measurements, hipCm: 94.5 }).expect(
      200,
    );
    expect(sufficient.body).toMatchObject({
      data: {
        recommendedSize: 'M',
        matchedMeasurements: ['hip'],
        confidence: 'LOW',
      },
    });
  });

  it.each([ProductStatus.DRAFT, ProductStatus.ARCHIVED])(
    'hides %s products even when the guide matches',
    async (status) => {
      await createGuide([medium]);
      await createVariant('M', 'Blue');
      await db.getRepository(Product).update(product.id, { status });
      await recommend(measurements).expect(404);
    },
  );

  it('distinguishes a malformed UUID from a missing product', async () => {
    await recommend(measurements, 'not-a-uuid').expect(400);
    await recommend(measurements, randomUUID()).expect(404);
  });

  it.each([
    [{ ...measurements, heightCm: -175 }, 'heightCm'],
    [{ ...measurements, weightKg: 0 }, 'weightKg'],
    [{ ...measurements, heightCm: 300 }, 'heightCm'],
    [{ ...measurements, weightKg: 501 }, 'weightKg'],
    [{ ...measurements, chestCm: 29 }, 'chestCm'],
    [{ ...measurements, waistCm: 301 }, 'waistCm'],
    [{ ...measurements, hipCm: 0 }, 'hipCm'],
    [{ ...measurements, heightCm: '175' }, 'heightCm'],
    [{ ...measurements, weightKg: {} }, 'weightKg'],
    [{ ...measurements, chestCm: null }, 'chestCm'],
    [{ ...measurements, hipCm: [100] }, 'hipCm'],
    [{ ...measurements, waistCm: true }, 'waistCm'],
    [{ heightCm: 175 }, 'weightKg'],
    [{ weightKg: 70 }, 'heightCm'],
    [{}, 'heightCm'],
    [{ ...measurements, size: 'M' }, 'size'],
  ] as const)('rejects invalid input for %j (%s)', async (body, field) => {
    const response = await recommend(body).expect(400);
    const detail: unknown = expect.objectContaining({ field });
    const details: unknown = expect.arrayContaining([detail]);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR', details },
    });
  });

  it('links the guide and decimal ranges to their product with database constraints', async () => {
    const guide = await createGuide([{ ...medium, maxChestCm: '100.25' }]);
    const stored = await db.getRepository(SizeGuide).findOneOrFail({
      where: { productId: product.id },
      relations: { product: true, ranges: true },
    });
    expect(stored).toMatchObject({
      id: guide.id,
      measurementUnit: 'cm',
      product: { id: product.id },
      ranges: [{ size: 'M', sizeGuideId: guide.id, maxChestCm: '100.25' }],
    });
    await expect(
      db
        .getRepository(SizeGuide)
        .save({ productId: product.id, name: 'Duplicate' }),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
    const ranges = db.getRepository(SizeGuideRange);
    await expect(
      ranges.save({ ...medium, sizeGuideId: guide.id }),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
    for (const bounds of [
      { minHeightCm: '180', maxHeightCm: '175' },
      { minWeightKg: '-1' },
      { maxHipCm: 'NaN' },
      {},
    ]) {
      await expect(
        ranges.save({ ...bounds, size: 'S', sizeGuideId: guide.id }),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    }
    await expect(
      ranges.save({ ...medium, sizeGuideId: randomUUID() }),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
  });

  it('documents the public endpoint and its outcomes in Swagger', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const path = [
      'paths',
      '/api/v1/products/{productId}/size-recommendation',
      'post',
    ];
    expect(response.body).toHaveProperty(
      [
        ...path,
        'requestBody',
        'content',
        'application/json',
        'examples',
        'basic',
        'value',
      ],
      measurements,
    );
    for (const status of ['200', '400', '404']) {
      expect(response.body).toHaveProperty([...path, 'responses', status]);
    }
  });
});
