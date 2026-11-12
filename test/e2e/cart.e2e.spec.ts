import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import { CartItem } from '../../src/modules/cart/entities/cart-item.entity';
import { Cart } from '../../src/modules/cart/entities/cart.entity';
import { ProductVariant } from '../../src/modules/catalog/entities/product-variant.entity';
import {
  Product,
  ProductStatus,
} from '../../src/modules/catalog/entities/product.entity';
import { Category } from '../../src/modules/categories/entities/category.entity';
import { InventoryBalance } from '../../src/modules/inventory/entities/inventory-balance.entity';
import { UserRole } from '../../src/modules/roles/user-role.enum';
import { User } from '../../src/modules/users/entities/user.entity';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;
const cartPath = '/api/v1/me/cart';
const itemsPath = `${cartPath}/items`;
const priceMinor = 125000;

interface Customer {
  id: string;
  token: string;
}

describeWithPostgres('Shopping cart with PostgreSQL and bearer JWT', () => {
  let app: INestApplication<Server>;
  let db: DataSource;
  let customer: Customer;
  let other: Customer;
  let categoryId: string;
  let active: ProductVariant;
  let unstocked: ProductVariant;
  let inactive: ProductVariant;
  let draft: ProductVariant;
  let archived: ProductVariant;
  const userIds: string[] = [];
  const productIds: string[] = [];

  function api() {
    return request(app.getHttpServer());
  }

  async function registerCustomer(): Promise<Customer> {
    const email = `cart-test-${randomUUID()}@example.com`;
    const password = 'test-cart-passphrase';
    const registration = await api()
      .post('/api/v1/auth/register')
      .send({ email, fullName: 'Cart Test', password })
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

  async function makeVariant(status: ProductStatus, isActive = true) {
    const product = await db.getRepository(Product).save({
      categoryId,
      status,
      name: 'Cotton Shirt',
      slug: `cart-shirt-${randomUUID()}`,
      description: 'Cart test fixture',
    });
    productIds.push(product.id);
    return db.getRepository(ProductVariant).save({
      productId: product.id,
      sku: `SHIRT-${randomUUID()}`,
      size: 'M',
      color: 'Blue',
      priceMinor,
      isActive,
    });
  }

  function add(owner: Customer, variantId: string, quantity = 1) {
    return api()
      .post(itemsPath)
      .set('Authorization', owner.token)
      .send({ variantId, quantity });
  }

  function getCart(owner: Customer) {
    return api().get(cartPath).set('Authorization', owner.token).expect(200);
  }

  async function addItem(owner: Customer, variantId: string, quantity = 1) {
    const response = await add(owner, variantId, quantity).expect(201);
    const { id } = (response.body as { data: { id: string } }).data;
    expect(response.body).toMatchObject({
      success: true,
      data: { id, variantId, quantity },
    });
    return id;
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
        'Apply migrations to TEST_DATABASE_URL before running cart tests',
      );
    }

    customer = await registerCustomer();
    other = await registerCustomer();
    const category = await db.getRepository(Category).save({
      name: 'Shirts',
      slug: `cart-shirts-${randomUUID()}`,
    });
    categoryId = category.id;
    active = await makeVariant(ProductStatus.PUBLISHED);
    unstocked = await makeVariant(ProductStatus.PUBLISHED);
    inactive = await makeVariant(ProductStatus.PUBLISHED, false);
    draft = await makeVariant(ProductStatus.DRAFT);
    archived = await makeVariant(ProductStatus.ARCHIVED);
    await db.getRepository(InventoryBalance).save({
      variantId: active.id,
      onHand: 5,
      reserved: 2,
    });
  }, 20000);

  afterEach(async () => {
    if (db && userIds.length) {
      await db.getRepository(Cart).delete({ userId: In(userIds) });
    }
  });

  afterAll(async () => {
    try {
      if (db && userIds.length) {
        await db.getRepository(Cart).delete({ userId: In(userIds) });
        await db.getRepository(User).delete({ id: In(userIds) });
      }
      if (active) {
        await db
          .getRepository(InventoryBalance)
          .delete({ variantId: active.id });
      }
      if (productIds.length) {
        await db
          .getRepository(ProductVariant)
          .delete({ productId: In(productIds) });
        await db.getRepository(Product).delete({ id: In(productIds) });
      }
      if (categoryId) {
        await db.getRepository(Category).delete(categoryId);
      }
    } finally {
      await app?.close();
      jest.restoreAllMocks();
    }
  });

  it('returns an empty cart without creating a row', async () => {
    const response = await getCart(customer);
    expect(response.body).toMatchObject({
      success: true,
      data: { items: [], subtotalMinor: 0, currency: 'BDT' },
    });
    expect(await db.getRepository(Cart).countBy({ userId: customer.id })).toBe(
      0,
    );
  });

  it('adds a variant, updates quantity and removes the item without changing stock', async () => {
    const id = await addItem(customer, active.id, 2);
    const initial = await getCart(customer);
    expect(initial.body).toMatchObject({
      data: {
        items: [
          {
            id,
            variantId: active.id,
            quantity: 2,
            priceMinor,
            product: {
              id: active.productId,
              name: 'Cotton Shirt',
              status: 'PUBLISHED',
            },
            variant: {
              sku: active.sku,
              size: 'M',
              color: 'Blue',
              isActive: true,
            },
            availableQuantity: 3,
            canPurchase: true,
          },
        ],
        subtotalMinor: 250000,
        currency: 'BDT',
      },
    });
    const updated = await api()
      .patch(`${itemsPath}/${id}`)
      .set('Authorization', customer.token)
      .send({ quantity: 3 })
      .expect(200);
    expect(updated.body).toMatchObject({
      data: { id, variantId: active.id, quantity: 3 },
    });
    expect((await getCart(customer)).body).toMatchObject({
      data: { items: [{ id, quantity: 3 }], subtotalMinor: 375000 },
    });
    const removed = await api()
      .delete(`${itemsPath}/${id}`)
      .set('Authorization', customer.token)
      .expect(204);
    expect(removed.text).toBe('');
    expect((await getCart(customer)).body).toMatchObject({
      data: { items: [], subtotalMinor: 0 },
    });
    await api()
      .delete(`${itemsPath}/${id}`)
      .set('Authorization', customer.token)
      .expect(404);
    expect(
      await db
        .getRepository(InventoryBalance)
        .findOneByOrFail({ variantId: active.id }),
    ).toMatchObject({ onHand: 5, reserved: 2 });
  });

  it('returns 409 for a duplicate without changing the existing quantity', async () => {
    const id = await addItem(customer, active.id);
    const duplicate = await add(customer, active.id, 3).expect(409);
    expect(duplicate.body).toMatchObject({
      success: false,
      error: { code: 'CONFLICT' },
    });
    expect((await getCart(customer)).body).toMatchObject({
      data: { items: [{ id, quantity: 1 }] },
    });
  });

  it('rejects invalid quantities and attempts to set ownership, prices or stock', async () => {
    const id = await addItem(customer, active.id);
    for (const quantity of [0, -1, 1.5, '2', 2147483648]) {
      const invalid = await api()
        .post(itemsPath)
        .set('Authorization', customer.token)
        .send({ variantId: unstocked.id, quantity })
        .expect(400);
      expect(invalid.body).toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
      await api()
        .patch(`${itemsPath}/${id}`)
        .set('Authorization', customer.token)
        .send({ quantity })
        .expect(400);
    }
    await api()
      .post(itemsPath)
      .set('Authorization', customer.token)
      .send({
        variantId: unstocked.id,
        quantity: 1,
        userId: other.id,
        priceMinor: 1,
        availableQuantity: 99,
      })
      .expect(400);
    await add(customer, 'invalid-uuid').expect(400);
    await api()
      .patch(`${itemsPath}/${id}`)
      .set('Authorization', customer.token)
      .send({ quantity: 1, variantId: unstocked.id })
      .expect(400);
    await api()
      .delete(`${itemsPath}/invalid-uuid`)
      .set('Authorization', customer.token)
      .expect(400);
  });

  it('rejects missing variants, inactive variants and variants of draft or archived products', async () => {
    for (const id of [randomUUID(), inactive.id, draft.id, archived.id]) {
      await add(customer, id).expect(404);
    }
    expect(await db.getRepository(Cart).countBy({ userId: customer.id })).toBe(
      0,
    );
  });

  it('isolates two carts and hides missing and other-owned item IDs', async () => {
    const id = await addItem(customer, active.id);
    const otherId = await addItem(other, active.id, 2);
    expect((await getCart(customer)).body).toMatchObject({
      data: { items: [{ id }] },
    });
    for (const targetId of [otherId, randomUUID()]) {
      const path = `${itemsPath}/${targetId}`;
      await api()
        .patch(path)
        .set('Authorization', customer.token)
        .send({ quantity: 3 })
        .expect(404);
      await api().delete(path).set('Authorization', customer.token).expect(404);
    }
    expect((await getCart(other)).body).toMatchObject({
      data: { items: [{ id: otherId, quantity: 2 }] },
    });
  });

  it('requires authentication and the customer role', async () => {
    await api().get(cartPath).expect(401);
    await api()
      .post(itemsPath)
      .send({ variantId: active.id, quantity: 1 })
      .expect(401);
    await db.getRepository(User).update(other.id, { role: UserRole.STAFF });
    try {
      await api().get(cartPath).set('Authorization', other.token).expect(403);
      await add(other, active.id).expect(403);
    } finally {
      await db
        .getRepository(User)
        .update(other.id, { role: UserRole.CUSTOMER });
    }
  });

  it('reflects current prices and allows quantities above availability, including missing balances', async () => {
    await addItem(customer, active.id, 4);
    await addItem(customer, unstocked.id, 1);
    const currentPrice = 150000;
    await db
      .getRepository(ProductVariant)
      .update(active.id, { priceMinor: currentPrice });
    try {
      const result = await getCart(customer);
      expect(result.body).toMatchObject({
        data: { subtotalMinor: 725000, currency: 'BDT' },
      });
      expect(result.body).toHaveProperty(
        'data.items',
        expect.arrayContaining([
          expect.objectContaining({
            variantId: active.id,
            priceMinor: currentPrice,
            quantity: 4,
            availableQuantity: 3,
            canPurchase: false,
          }),
          expect.objectContaining({
            variantId: unstocked.id,
            availableQuantity: 0,
            canPurchase: false,
          }),
        ]),
      );
    } finally {
      await db.getRepository(ProductVariant).update(active.id, { priceMinor });
    }
  });

  it('keeps previously added lines visible after publication or variant status changes', async () => {
    const id = await addItem(customer, active.id);
    await db
      .getRepository(Product)
      .update(active.productId, { status: ProductStatus.ARCHIVED });
    try {
      expect((await getCart(customer)).body).toMatchObject({
        data: {
          items: [
            {
              id,
              product: { status: ProductStatus.ARCHIVED },
              canPurchase: false,
            },
          ],
        },
      });
      await add(customer, active.id).expect(409);
    } finally {
      await db
        .getRepository(Product)
        .update(active.productId, { status: ProductStatus.PUBLISHED });
    }
    await db
      .getRepository(ProductVariant)
      .update(active.id, { isActive: false });
    try {
      expect((await getCart(customer)).body).toMatchObject({
        data: {
          items: [{ id, variant: { isActive: false }, canPurchase: false }],
        },
      });
      await api()
        .patch(`${itemsPath}/${id}`)
        .set('Authorization', customer.token)
        .send({ quantity: 2 })
        .expect(200);
    } finally {
      await db
        .getRepository(ProductVariant)
        .update(active.id, { isActive: true });
    }
  });

  it('creates only one cart when two different variants are added concurrently', async () => {
    const results = await Promise.all([
      add(customer, active.id),
      add(customer, unstocked.id),
    ]);
    expect(results.map(({ status }) => status)).toEqual([201, 201]);
    expect(await db.getRepository(Cart).countBy({ userId: customer.id })).toBe(
      1,
    );
    expect((await getCart(customer)).body).toHaveProperty(
      'data.items.length',
      2,
    );
  });

  it('enforces cart and item uniqueness in PostgreSQL, including concurrent duplicate adds', async () => {
    const results = await Promise.all([
      add(customer, active.id),
      add(customer, active.id),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    const carts = db.getRepository(Cart);
    const items = db.getRepository(CartItem);
    const cart = await carts.findOneByOrFail({ userId: customer.id });
    expect(await items.countBy({ cartId: cart.id })).toBe(1);
    await expect(carts.insert({ userId: customer.id })).rejects.toMatchObject({
      driverError: { code: '23505', constraint: 'uq_carts_user' },
    });
    await expect(
      items.insert({ cartId: cart.id, variantId: active.id, quantity: 1 }),
    ).rejects.toMatchObject({
      driverError: { code: '23505', constraint: 'uq_cart_items_cart_variant' },
    });
    await expect(
      items.insert({ cartId: cart.id, variantId: unstocked.id, quantity: 0 }),
    ).rejects.toMatchObject({
      driverError: { code: '23514', constraint: 'ck_cart_items_quantity' },
    });
  });

  it('documents cart endpoints and the bearer requirement in Swagger', async () => {
    const docs = await api().get('/api/docs-json').expect(200);
    expect(docs.body).toHaveProperty(
      ['paths', cartPath, 'get', 'security'],
      [{ bearer: [] }],
    );
    expect(docs.body).toHaveProperty([
      'paths',
      itemsPath,
      'post',
      'responses',
      '409',
    ]);
    expect(docs.body).toHaveProperty([
      'paths',
      `${itemsPath}/{itemId}`,
      'patch',
      'responses',
      '200',
    ]);
    expect(docs.body).toHaveProperty([
      'paths',
      `${itemsPath}/{itemId}`,
      'delete',
      'responses',
      '204',
    ]);
  });
});
