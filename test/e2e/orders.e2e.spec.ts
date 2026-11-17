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
import { OrderItem } from '../../src/modules/orders/entities/order-item.entity';
import {
  Order,
  OrderStatus,
} from '../../src/modules/orders/entities/order.entity';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { UserRole } from '../../src/modules/roles/user-role.enum';
import { User } from '../../src/modules/users/entities/user.entity';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;
const ordersPath = '/api/v1/me/orders';
const purchaseDate = new Date('2026-11-12T08:00:00.000Z');
const shippingAddressSnapshot = {
  recipient: 'Samira Rahman',
  phone: '+8801712345678',
  addressLine1: 'House 12, Road 5',
  addressLine2: null,
  city: 'Dhaka',
};

interface Customer {
  id: string;
  token: string;
}

describeWithPostgres('Order history with PostgreSQL and bearer JWT', () => {
  let app: INestApplication<Server>;
  let db: DataSource;
  let customer: Customer;
  let other: Customer;
  const userIds: string[] = [];
  const orderIds: string[] = [];
  let categoryId: string | undefined;
  let productId: string | undefined;

  function api() {
    return request(app.getHttpServer());
  }

  async function registerCustomer(): Promise<Customer> {
    const email = `orders-test-${randomUUID()}@example.com`;
    const password = 'test-orders-passphrase';
    const registration = await api()
      .post('/api/v1/auth/register')
      .send({ email, fullName: 'Order History Test', password })
      .expect(201);
    const { id } = (registration.body as { data: { id: string } }).data;
    userIds.push(id);

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const { accessToken } = (login.body as { data: { accessToken: string } })
      .data;
    return { id, token: `Bearer ${accessToken}` };
  }

  async function createOrder(
    owner: Customer,
    createdAt = purchaseDate,
    totalMinor = '250000',
  ) {
    const order = await db.getRepository(Order).save({
      userId: owner.id,
      status: OrderStatus.CONFIRMED,
      totalMinor,
      shippingAddressSnapshot,
      createdAt,
      updatedAt: createdAt,
    });
    orderIds.push(order.id);
    return order;
  }

  function getOrder(id: string, owner = customer) {
    return api().get(`${ordersPath}/${id}`).set('Authorization', owner.token);
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
      throw new Error(
        'Apply migrations to TEST_DATABASE_URL before running orders tests',
      );
    }
    customer = await registerCustomer();
    other = await registerCustomer();
  }, 20000);

  afterEach(async () => {
    if (orderIds.length) {
      await db.getRepository(OrderItem).delete({ orderId: In(orderIds) });
      await db.getRepository(Order).delete({ id: In(orderIds) });
      orderIds.length = 0;
    }
  });

  afterAll(async () => {
    try {
      if (productId) {
        await db.getRepository(ProductVariant).delete({ productId });
        await db.getRepository(Product).delete(productId);
      }
      if (categoryId) {
        await db.getRepository(Category).delete(categoryId);
      }
      if (userIds.length) {
        await db.getRepository(User).delete({ id: In(userIds) });
      }
    } finally {
      await app?.close();
      jest.restoreAllMocks();
    }
  });

  it('returns empty order history with default pagination', async () => {
    const response = await api()
      .get(ordersPath)
      .set('Authorization', customer.token)
      .expect(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'OK',
      data: [],
      meta: {
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    });
    expect(response.body).toHaveProperty('meta.requestId', expect.any(String));
  });

  it('paginates only owned summaries by newest date and descending ID for ties', async () => {
    const oldest = await createOrder(
      customer,
      new Date('2026-11-10T08:00:00.000Z'),
    );
    const first = await createOrder(customer);
    const second = await createOrder(customer);
    await createOrder(other);
    const newestIds = [first.id, second.id].sort().reverse();

    const list = (page: number, limit: number) =>
      api()
        .get(ordersPath)
        .set('Authorization', customer.token)
        .query({ page, limit })
        .expect(200);

    const firstPage = await list(1, 2);
    expect(firstPage.body).toMatchObject({
      data: newestIds.map((id) => ({
        id,
        status: 'CONFIRMED',
        currency: 'BDT',
        totalMinor: '250000',
        createdAt: purchaseDate.toISOString(),
        updatedAt: purchaseDate.toISOString(),
      })),
      meta: { pagination: { page: 1, limit: 2, total: 3, totalPages: 2 } },
    });
    expect(firstPage.body).not.toHaveProperty('data.0.shippingAddressSnapshot');
    expect(firstPage.body).not.toHaveProperty('data.0.items');
    expect(firstPage.body).not.toHaveProperty('data.0.userId');

    expect((await list(2, 2)).body).toMatchObject({
      data: [{ id: oldest.id }],
      meta: { pagination: { page: 2, limit: 2, total: 3, totalPages: 2 } },
    });
    expect((await list(3, 2)).body).toHaveProperty('data', []);
    expect((await list(1, 100)).body).toHaveProperty('data.length', 3);
  });

  it('reads an owned order and keeps snapshots after catalog edits and deletion', async () => {
    const category = await db.getRepository(Category).save({
      name: 'Shirts',
      slug: `order-shirts-${randomUUID()}`,
    });
    categoryId = category.id;
    const product = await db.getRepository(Product).save({
      categoryId,
      status: ProductStatus.PUBLISHED,
      name: 'Cotton Shirt',
      slug: `order-shirt-${randomUUID()}`,
      description: 'Original product description',
    });
    productId = product.id;
    const variants = db.getRepository(ProductVariant);
    const variant = await variants.save({
      productId,
      sku: `SHIRT-${randomUUID()}`,
      size: 'M',
      color: 'Blue',
      priceMinor: 125000,
    });
    const order = await createOrder(customer);
    const item = await db.getRepository(OrderItem).save({
      orderId: order.id,
      variantId: variant.id,
      skuSnapshot: variant.sku,
      nameSnapshot: product.name,
      sizeSnapshot: variant.size,
      colorSnapshot: variant.color,
      unitPriceMinor: '125000',
      quantity: 2,
      lineTotalMinor: '250000',
      createdAt: purchaseDate,
    });
    const before = await getOrder(order.id).expect(200);
    expect(before.body).toMatchObject({
      success: true,
      data: {
        id: order.id,
        status: 'CONFIRMED',
        currency: 'BDT',
        totalMinor: '250000',
        createdAt: purchaseDate.toISOString(),
        updatedAt: purchaseDate.toISOString(),
        shippingAddressSnapshot,
        items: [
          {
            id: item.id,
            variantId: variant.id,
            skuSnapshot: variant.sku,
            nameSnapshot: 'Cotton Shirt',
            sizeSnapshot: 'M',
            colorSnapshot: 'Blue',
            unitPriceMinor: '125000',
            quantity: 2,
            lineTotalMinor: '250000',
            createdAt: purchaseDate.toISOString(),
          },
        ],
      },
    });

    await db.getRepository(Product).update(product.id, {
      name: 'Linen Shirt',
      description: 'Revised product description',
    });
    await variants.update(variant.id, {
      sku: `EDITED-${randomUUID()}`,
      size: 'L',
      color: 'White',
      priceMinor: 199000,
    });
    const savedDetail = (before.body as { data: unknown }).data;
    expect((await getOrder(order.id).expect(200)).body).toHaveProperty(
      'data',
      savedDetail,
    );

    await variants.delete(variant.id);
    expect((await getOrder(order.id).expect(200)).body).toMatchObject({
      data: {
        shippingAddressSnapshot,
        items: [
          {
            variantId: null,
            skuSnapshot: variant.sku,
            nameSnapshot: 'Cotton Shirt',
            sizeSnapshot: 'M',
            colorSnapshot: 'Blue',
            unitPriceMinor: '125000',
            quantity: 2,
            lineTotalMinor: '250000',
          },
        ],
      },
    });
  });

  it('returns BIGINT amounts exactly in lists and details', async () => {
    const totalMinor = '9223372036854775807';
    const order = await createOrder(customer, purchaseDate, totalMinor);
    await db.getRepository(OrderItem).save({
      orderId: order.id,
      variantId: null,
      skuSnapshot: 'HISTORICAL-SKU',
      nameSnapshot: 'Historical Product',
      sizeSnapshot: 'M',
      colorSnapshot: 'Blue',
      unitPriceMinor: totalMinor,
      quantity: 1,
      lineTotalMinor: totalMinor,
    });
    const list = await api()
      .get(ordersPath)
      .set('Authorization', customer.token)
      .expect(200);
    expect(list.body).toHaveProperty('data.0.totalMinor', totalMinor);
    expect((await getOrder(order.id).expect(200)).body).toMatchObject({
      data: {
        totalMinor,
        items: [
          {
            unitPriceMinor: totalMinor,
            lineTotalMinor: totalMinor,
            quantity: 1,
          },
        ],
      },
    });
  });

  it('returns the same 404 for missing orders and orders owned by another customer', async () => {
    const foreign = await createOrder(other);
    for (const id of [randomUUID(), foreign.id]) {
      const response = await getOrder(id).expect(404);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Order not found',
        error: { code: 'NOT_FOUND' },
      });
    }
    await getOrder(foreign.id, other).expect(200);
  });

  it('requires bearer authentication and the current CUSTOMER role on both routes', async () => {
    const order = await createOrder(other);
    const paths = [ordersPath, `${ordersPath}/${order.id}`];
    for (const path of paths) {
      await api().get(path).expect(401);
    }
    await db.getRepository(User).update(other.id, { role: UserRole.STAFF });
    try {
      for (const path of paths) {
        await api().get(path).set('Authorization', other.token).expect(403);
      }
    } finally {
      await db
        .getRepository(User)
        .update(other.id, { role: UserRole.CUSTOMER });
    }
  });

  it('rejects invalid UUIDs, pagination and an explicit customer filter', async () => {
    await getOrder('invalid-uuid').expect(400);
    for (const [field, value] of [
      ['page', '0'],
      ['page', '1.5'],
      ['page', '2147483648'],
      ['limit', '-1'],
      ['limit', '101'],
      ['limit', 'invalid'],
      ['userId', other.id],
    ]) {
      const response = await api()
        .get(ordersPath)
        .set('Authorization', customer.token)
        .query({ [field]: value })
        .expect(400);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(response.body).toHaveProperty(
        'error.details',
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    }
  });

  it('exposes order summaries to internal callers', async () => {
    const order = await createOrder(customer);
    const service = app.get(OrdersService);
    expect(await service.findSummaryById(order.id)).toEqual({
      id: order.id,
      status: OrderStatus.CONFIRMED,
      currency: 'BDT',
      totalMinor: '250000',
      createdAt: purchaseDate,
      updatedAt: purchaseDate,
    });
    expect(await service.findSummaryById(randomUUID())).toBeNull();
  });

  it('documents both order routes with bearer authentication in Swagger', async () => {
    const docs = await api().get('/api/docs-json').expect(200);
    for (const path of [ordersPath, `${ordersPath}/{id}`]) {
      expect(docs.body).toHaveProperty(
        ['paths', path, 'get', 'security'],
        [{ bearer: [] }],
      );
      for (const code of ['200', '400', '401', '403']) {
        expect(docs.body).toHaveProperty([
          'paths',
          path,
          'get',
          'responses',
          code,
        ]);
      }
    }
    expect(docs.body).toHaveProperty([
      'paths',
      `${ordersPath}/{id}`,
      'get',
      'responses',
      '404',
    ]);
  });
});
