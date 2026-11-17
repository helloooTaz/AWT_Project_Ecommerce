import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request, {
  type Response as HttpResponse,
  type Test as HttpTest,
} from 'supertest';
import { DataSource, In, type EntityManager } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import { Address } from '../../src/modules/addresses/entities/address.entity';
import { CartService } from '../../src/modules/cart/cart.service';
import { CartItem } from '../../src/modules/cart/entities/cart-item.entity';
import { Cart } from '../../src/modules/cart/entities/cart.entity';
import { ProductVariant } from '../../src/modules/catalog/entities/product-variant.entity';
import {
  Product,
  ProductStatus,
} from '../../src/modules/catalog/entities/product.entity';
import { Category } from '../../src/modules/categories/entities/category.entity';
import { IdempotencyRecord } from '../../src/modules/checkout/entities/idempotency-record.entity';
import { InventoryBalance } from '../../src/modules/inventory/entities/inventory-balance.entity';
import {
  StockReservation,
  StockReservationStatus,
} from '../../src/modules/inventory/entities/stock-reservation.entity';
import { OrderItem } from '../../src/modules/orders/entities/order-item.entity';
import {
  Order,
  OrderStatus,
} from '../../src/modules/orders/entities/order.entity';
import { UserRole } from '../../src/modules/roles/user-role.enum';
import { User } from '../../src/modules/users/entities/user.entity';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;
const checkoutPath = '/api/v1/checkout';
const ordersPath = '/api/v1/me/orders';
const cartPath = '/api/v1/me/cart';
const responseTime = /^\d+\.\d{2}ms$/;
const deliveryAddress = {
  recipient: 'Samira Rahman',
  phone: '+8801712345678',
  addressLine1: 'House 12, Road 5',
  addressLine2: null,
  city: 'Dhaka',
};

interface Customer {
  id: string;
  token: string;
  addressId: string;
}

function checkoutData(body: unknown) {
  return (
    body as {
      data: {
        orderId: string;
        status: OrderStatus;
        currency: 'BDT';
        totalMinor: string;
      };
    }
  ).data;
}

describeWithPostgres('Atomic checkout with PostgreSQL and bearer JWT', () => {
  let app: INestApplication<Server>;
  let db: DataSource;
  let customer: Customer;
  let other: Customer;
  let staff: Customer;
  let secondAddressId: string;
  let categoryId: string;
  const userIds: string[] = [];
  const variantIds: string[] = [];
  const productIds: string[] = [];

  function api() {
    return request(app.getHttpServer());
  }

  async function createCustomer(role = UserRole.CUSTOMER): Promise<Customer> {
    const user = await db.getRepository(User).save({
      email: `checkout-${randomUUID()}@example.com`,
      fullName: 'Checkout Test',
      passwordHash: 'unused-for-signed-jwt-fixtures',
      role,
    });
    userIds.push(user.id);
    const address = await db.getRepository(Address).save({
      ...deliveryAddress,
      userId: user.id,
    });
    const token = await app.get(JwtService).signAsync({ sub: user.id });
    return { id: user.id, token: `Bearer ${token}`, addressId: address.id };
  }

  async function createVariant({
    priceMinor = 125000,
    onHand = 10,
    reserved = 0,
  }: { priceMinor?: number; onHand?: number | null; reserved?: number } = {}) {
    const product = await db.getRepository(Product).save({
      categoryId,
      status: ProductStatus.PUBLISHED,
      name: 'Cotton Shirt',
      slug: `checkout-shirt-${randomUUID()}`,
      description: 'Checkout fixture',
    });
    productIds.push(product.id);
    const variant = await db.getRepository(ProductVariant).save({
      productId: product.id,
      sku: `SHIRT-${randomUUID()}`,
      size: 'M',
      color: 'Blue',
      priceMinor,
    });
    variantIds.push(variant.id);
    if (onHand !== null) {
      await db.getRepository(InventoryBalance).save({
        variantId: variant.id,
        onHand,
        reserved,
      });
    }
    return variant;
  }

  function add(owner: Customer, variant: ProductVariant, quantity = 1) {
    return api()
      .post(`${cartPath}/items`)
      .set('Authorization', owner.token)
      .send({ variantId: variant.id, quantity })
      .expect(201);
  }

  function checkout(owner: Customer, key: string, addressId = owner.addressId) {
    return api()
      .post(checkoutPath)
      .set('Authorization', owner.token)
      .set('Idempotency-Key', key)
      .send({ addressId });
  }

  function getCart(owner: Customer) {
    return api().get(cartPath).set('Authorization', owner.token).expect(200);
  }

  function balance(variant: ProductVariant) {
    return db
      .getRepository(InventoryBalance)
      .findOneByOrFail({ variantId: variant.id });
  }

  async function expectNoPurchase() {
    expect(await db.getRepository(Order).countBy({ userId: In(userIds) })).toBe(
      0,
    );
    expect(
      await db.getRepository(OrderItem).countBy({ variantId: In(variantIds) }),
    ).toBe(0);
    expect(
      await db
        .getRepository(StockReservation)
        .countBy({ variantId: In(variantIds) }),
    ).toBe(0);
    expect(
      await db
        .getRepository(IdempotencyRecord)
        .countBy({ userId: In(userIds) }),
    ).toBe(0);
  }

  async function runContendingRequests(
    lock: (manager: EntityManager) => Promise<unknown>,
    requests: HttpTest[],
  ) {
    const blocker = db.createQueryRunner();
    let pending: Promise<PromiseSettledResult<HttpResponse>[]>;
    let blocked = 0;
    try {
      await blocker.startTransaction();
      const [{ pid }] = await blocker.manager.query<{ pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      await lock(blocker.manager);
      pending = Promise.allSettled(requests);
      for (
        let attempt = 0;
        attempt < 150 && blocked < requests.length;
        attempt++
      ) {
        const [{ count }] = await db.manager.query<{ count: number }[]>(
          `WITH RECURSIVE blocked(pid) AS (
             SELECT $1::int
             UNION
             SELECT activity.pid
             FROM pg_stat_activity AS activity
             JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
             WHERE activity.datname = current_database()
               AND activity.wait_event_type = 'Lock'
           )
           SELECT count(*)::int - 1 AS count FROM blocked`,
          [pid],
        );
        blocked = count;
        if (blocked < requests.length) {
          await delay(20);
        }
      }
    } finally {
      if (blocker.isTransactionActive) {
        await blocker.rollbackTransaction();
      }
      await blocker.release();
    }
    const results = await pending;
    expect(blocked).toBeGreaterThanOrEqual(requests.length);
    return results.map((result) => {
      if (result.status === 'rejected') {
        throw result.reason;
      }
      return result.value;
    });
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
    customer = await createCustomer();
    other = await createCustomer();
    staff = await createCustomer(UserRole.STAFF);
    const secondAddress = await db.getRepository(Address).save({
      ...deliveryAddress,
      addressLine1: 'House 31',
      userId: customer.id,
    });
    secondAddressId = secondAddress.id;
    const category = await db.getRepository(Category).save({
      name: 'Shirts',
      slug: `checkout-shirts-${randomUUID()}`,
    });
    categoryId = category.id;
  }, 20000);

  afterEach(async () => {
    if (!db || !userIds.length) {
      return;
    }
    await db.getRepository(IdempotencyRecord).delete({ userId: In(userIds) });
    const orders = await db
      .getRepository(Order)
      .findBy({ userId: In(userIds) });
    if (orders.length) {
      const orderIds = orders.map(({ id }) => id);
      const items = await db
        .getRepository(OrderItem)
        .findBy({ orderId: In(orderIds) });
      await db
        .getRepository(StockReservation)
        .delete({ orderItemId: In(items.map(({ id }) => id)) });
      await db.getRepository(OrderItem).delete({ orderId: In(orderIds) });
      await db.getRepository(Order).delete({ id: In(orderIds) });
    }
    await db.getRepository(Cart).delete({ userId: In(userIds) });
    if (variantIds.length) {
      await db
        .getRepository(InventoryBalance)
        .delete({ variantId: In(variantIds) });
      await db.getRepository(ProductVariant).delete({ id: In(variantIds) });
      variantIds.length = 0;
    }
    if (productIds.length) {
      await db.getRepository(Product).delete({ id: In(productIds) });
      productIds.length = 0;
    }
  });

  afterAll(async () => {
    try {
      if (userIds.length) {
        await db.getRepository(Address).delete({ userId: In(userIds) });
        await db.getRepository(User).delete({ id: In(userIds) });
      }
      if (categoryId) {
        await db.getRepository(Category).delete(categoryId);
      }
    } finally {
      await app?.close();
      jest.restoreAllMocks();
    }
  });

  it('requires a valid customer JWT and a valid key and body', async () => {
    const unauthorized = await api()
      .post(checkoutPath)
      .send({ addressId: customer.addressId })
      .expect(401);
    expect(unauthorized.headers['x-response-time']).toBeUndefined();
    expect(unauthorized.headers['x-request-id']).toEqual(expect.any(String));
    expect(unauthorized.body).toHaveProperty(
      'meta.requestId',
      unauthorized.headers['x-request-id'],
    );
    await checkout(staff, 'checkout-key').expect(403);
    await checkout(customer, 'checkout-key', 'invalid-uuid').expect(400);
    for (const key of ['', 'invalid key', 'a'.repeat(129)]) {
      const response = await checkout(customer, key).expect(400);
      expect(response.body).toHaveProperty('error.code', 'VALIDATION_ERROR');
    }
    await api()
      .post(checkoutPath)
      .set('Authorization', customer.token)
      .send({ addressId: customer.addressId })
      .expect(400);
    await api()
      .post(checkoutPath)
      .set('Authorization', customer.token)
      .set('Idempotency-Key', 'first-key, second-key')
      .send({ addressId: customer.addressId })
      .expect(400);
    const extra = await checkout(customer, 'checkout-key')
      .send({
        totalMinor: '1',
        userId: other.id,
        status: 'CONFIRMED',
        onHand: 50,
      })
      .expect(400);
    expect(extra.body).toHaveProperty('error.code', 'VALIDATION_ERROR');
  });

  it('rejects empty carts and hides addresses belonging to other customers', async () => {
    const empty = await checkout(customer, 'empty')
      .expect('X-Response-Time', responseTime)
      .expect(400);
    expect(empty.body).toHaveProperty('message', 'Cart is empty');
    expect(empty.body).toHaveProperty(
      'meta.requestId',
      empty.headers['x-request-id'],
    );
    await add(customer, await createVariant());
    await checkout(customer, 'foreign-address', other.addressId).expect(404);
    await checkout(customer, 'missing-address', randomUUID()).expect(404);
    await expectNoPurchase();
  });

  it('commits current prices, item and address snapshots, reservations and cart clearing together', async () => {
    const first = await createVariant({ reserved: 1 });
    const second = await createVariant({ priceMinor: 50000 });
    await add(customer, first, 2);
    await add(customer, second, 3);
    await db
      .getRepository(ProductVariant)
      .update(first.id, { priceMinor: 185000 });
    const start = Date.now();
    const result = await checkout(customer, 'snapshot')
      .expect('X-Response-Time', responseTime)
      .expect(201);
    const { orderId } = checkoutData(result.body);
    expect(result.body).toEqual({
      success: true,
      message: 'Order created',
      data: {
        orderId,
        status: 'PENDING_PAYMENT',
        currency: 'BDT',
        totalMinor: '520000',
      },
      meta: { requestId: result.headers['x-request-id'] },
    });
    const detail = await api()
      .get(`${ordersPath}/${orderId}`)
      .set('Authorization', customer.token)
      .expect(200);
    expect(detail.body).toMatchObject({
      data: {
        id: orderId,
        shippingAddressSnapshot: deliveryAddress,
        totalMinor: '520000',
      },
    });
    expect(detail.body).toHaveProperty('data.items.length', 2);
    expect(detail.body).toHaveProperty(
      'data.items',
      expect.arrayContaining([
        expect.objectContaining({
          variantId: first.id,
          skuSnapshot: first.sku,
          nameSnapshot: 'Cotton Shirt',
          sizeSnapshot: 'M',
          colorSnapshot: 'Blue',
          unitPriceMinor: '185000',
          quantity: 2,
          lineTotalMinor: '370000',
        }),
        expect.objectContaining({
          variantId: second.id,
          quantity: 3,
          unitPriceMinor: '50000',
          lineTotalMinor: '150000',
        }),
      ]),
    );
    const history = await api()
      .get(ordersPath)
      .set('Authorization', customer.token)
      .expect(200);
    expect(history.body).toHaveProperty('data.0.id', orderId);
    const cart = await getCart(customer);
    expect(cart.body).toHaveProperty('data.items', []);
    expect(await balance(first)).toMatchObject({ onHand: 10, reserved: 3 });
    expect(await balance(second)).toMatchObject({ onHand: 10, reserved: 3 });
    const reservations = await db.getRepository(StockReservation).find({
      where: { orderItem: { orderId } },
      relations: { orderItem: true },
    });
    expect(reservations).toHaveLength(2);
    for (const reservation of reservations) {
      expect(reservation.status).toBe(StockReservationStatus.ACTIVE);
      expect(reservation.variantId).toBe(reservation.orderItem.variantId);
      expect(reservation.quantity).toBe(reservation.orderItem.quantity);
      expect(reservation.expiresAt.getTime()).toBeGreaterThanOrEqual(
        start + 15 * 60 * 1000,
      );
    }
    expect(
      await db
        .getRepository(IdempotencyRecord)
        .findOneBy({ userId: customer.id, requestKey: 'snapshot' }),
    ).toMatchObject({ orderId });
  });

  it('keeps totals beyond the JavaScript safe integer range exact', async () => {
    const quantity = 5_000_000;
    const priceMinor = 2147483647;
    const variant = await createVariant({ priceMinor, onHand: quantity });
    await add(customer, variant, quantity);
    const response = await checkout(customer, 'large').expect(201);
    const totalMinor = (BigInt(priceMinor) * BigInt(quantity)).toString();
    const { orderId } = checkoutData(response.body);
    expect(response.body).toHaveProperty('data.totalMinor', totalMinor);
    expect(
      await db.getRepository(OrderItem).findOneBy({ orderId }),
    ).toMatchObject({
      unitPriceMinor: String(priceMinor),
      lineTotalMinor: totalMinor,
      quantity,
    });
  });

  it('rejects totals outside the PostgreSQL BIGINT range and preserves the cart', async () => {
    const maxInteger = 2147483647;
    for (let i = 0; i < 3; i++) {
      await add(
        customer,
        await createVariant({ priceMinor: maxInteger }),
        maxInteger,
      );
    }
    const response = await checkout(customer, 'overflow').expect(409);
    expect(response.body).toHaveProperty(
      'message',
      'Order total exceeds the supported amount',
    );
    await expectNoPurchase();
    const cart = await getCart(customer);
    expect(cart.body).toHaveProperty('data.items.length', 3);
  });

  it('rejects a missing balance and insufficient stock, then accepts a retry with the same key', async () => {
    const first = await createVariant();
    const second = await createVariant({ onHand: null });
    await add(customer, first, 2);
    await add(customer, second, 3);
    await checkout(customer, 'retry-stock').expect(409);
    await expectNoPurchase();
    const low = await db
      .getRepository(InventoryBalance)
      .save({ variantId: second.id, onHand: 3, reserved: 1 });
    await checkout(customer, 'retry-stock').expect(409);
    await expectNoPurchase();
    expect(await balance(first)).toMatchObject({ reserved: 0 });
    expect(await balance(second)).toMatchObject({ onHand: 3, reserved: 1 });
    const cart = await getCart(customer);
    expect(cart.body).toHaveProperty('data.items.length', 2);
    await db.getRepository(InventoryBalance).update(low.id, { onHand: 4 });
    await checkout(customer, 'retry-stock').expect(201);
  });

  it('rejects inactive variants and draft or archived products already in a cart', async () => {
    const variant = await createVariant();
    await add(customer, variant);
    await db
      .getRepository(ProductVariant)
      .update(variant.id, { isActive: false });
    await checkout(customer, 'unavailable').expect(404);
    await db
      .getRepository(ProductVariant)
      .update(variant.id, { isActive: true });
    for (const status of [ProductStatus.DRAFT, ProductStatus.ARCHIVED]) {
      await db.getRepository(Product).update(variant.productId, { status });
      await checkout(customer, 'unavailable').expect(404);
    }
    await expectNoPurchase();
    const cart = await getCart(customer);
    expect(cart.body).toHaveProperty('data.items.0.variantId', variant.id);
  });

  it('rolls back every write after a failure at the end of the transaction', async () => {
    const variant = await createVariant();
    await add(customer, variant, 2);
    const cart = app.get(CartService);
    const clear = cart.clearPurchasedItems.bind(cart);
    const failAfterClear = jest
      .spyOn(cart, 'clearPurchasedItems')
      .mockImplementationOnce(async (manager, cartId, itemIds) => {
        await clear(manager, cartId, itemIds);
        throw new Error('Fixture failure after all checkout writes');
      });
    try {
      await checkout(customer, 'forced-rollback').expect(500);
      expect(failAfterClear).toHaveBeenCalledTimes(1);
      await expectNoPurchase();
      expect(await balance(variant)).toMatchObject({ onHand: 10, reserved: 0 });
      const remaining = await getCart(customer);
      expect(remaining.body).toHaveProperty('data.items.0.quantity', 2);
    } finally {
      failAfterClear.mockRestore();
    }
    await checkout(customer, 'forced-rollback').expect(201);
  });

  it('replays after cart clearing and leaves later cart contents intact', async () => {
    const variant = await createVariant();
    await add(customer, variant);
    const result = await checkout(customer, 'replay').expect(201);
    const first = checkoutData(result.body);
    const afterClear = await checkout(
      customer,
      'replay',
      customer.addressId.toUpperCase(),
    )
      .expect('X-Response-Time', responseTime)
      .expect(200);
    expect(afterClear.body).toHaveProperty('data', first);
    await add(customer, variant, 2);
    const later = await checkout(customer, 'replay').expect(200);
    expect(later.body).toHaveProperty('data', first);
    await checkout(customer, 'replay', secondAddressId).expect(409);
    const cart = await getCart(customer);
    expect(cart.body).toHaveProperty('data.items.0.quantity', 2);
    expect(await balance(variant)).toMatchObject({ reserved: 1 });
    const another = await checkout(
      customer,
      'another-key',
      secondAddressId,
    ).expect(201);
    expect(checkoutData(another.body).orderId).not.toBe(first.orderId);
    expect(await db.getRepository(Order).countBy({ userId: customer.id })).toBe(
      2,
    );
  });

  it('allows different customers to use the same key independently', async () => {
    const variant = await createVariant();
    await add(customer, variant);
    await add(other, variant);
    const first = await checkout(customer, 'shared-key').expect(201);
    const second = await checkout(other, 'shared-key').expect(201);
    expect(checkoutData(first.body).orderId).not.toBe(
      checkoutData(second.body).orderId,
    );
    expect(
      await db.getRepository(IdempotencyRecord).countBy({
        userId: In([customer.id, other.id]),
        requestKey: 'shared-key',
      }),
    ).toBe(2);
  });

  it('lets only one customer reserve the last unit under concurrent checkout', async () => {
    const variant = await createVariant({ onHand: 1 });
    await add(customer, variant);
    await add(other, variant);
    const responses = await runContendingRequests(
      (manager) =>
        manager.getRepository(InventoryBalance).findOne({
          where: { variantId: variant.id },
          lock: { mode: 'pessimistic_write' },
        }),
      [checkout(customer, 'last-unit-a'), checkout(other, 'last-unit-b')],
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await balance(variant)).toMatchObject({ onHand: 1, reserved: 1 });
    expect(
      await db.getRepository(OrderItem).countBy({ variantId: variant.id }),
    ).toBe(1);
    expect(
      await db
        .getRepository(StockReservation)
        .countBy({ variantId: variant.id }),
    ).toBe(1);
    expect(
      await db
        .getRepository(IdempotencyRecord)
        .countBy({ userId: In(userIds) }),
    ).toBe(1);
    expect(
      await db.getRepository(CartItem).countBy({ variantId: variant.id }),
    ).toBe(1);
  }, 15000);

  it.each([
    ['same key', 'concurrent-first', 200],
    ['different keys', 'concurrent-second', 400],
  ] as const)(
    'prevents a duplicate purchase when concurrent requests use %s',
    async (_, secondKey, expectedStatus) => {
      const variant = await createVariant();
      await add(customer, variant, 2);
      const responses = await runContendingRequests(
        (manager) => app.get(CartService).lockForCheckout(manager, customer.id),
        [checkout(customer, 'concurrent-first'), checkout(customer, secondKey)],
      );
      expect(responses.map(({ status }) => status).sort()).toEqual(
        [201, expectedStatus].sort(),
      );
      if (expectedStatus === 200) {
        expect(checkoutData(responses[0].body)).toEqual(
          checkoutData(responses[1].body),
        );
      }
      expect(
        await db.getRepository(Order).countBy({ userId: customer.id }),
      ).toBe(1);
      expect(
        await db
          .getRepository(IdempotencyRecord)
          .countBy({ userId: customer.id }),
      ).toBe(1);
      expect(await balance(variant)).toMatchObject({ onHand: 10, reserved: 2 });
    },
    15000,
  );

  it('documents bearer authentication, the key header and both success codes in Swagger', async () => {
    const docs = await api().get('/api/docs-json').expect(200);
    const operation = ['paths', checkoutPath, 'post'];
    expect(docs.body).toHaveProperty(
      [...operation, 'security'],
      [{ bearer: [] }],
    );
    expect(docs.body).toHaveProperty(
      [...operation, 'parameters'],
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
        }),
      ]),
    );
    expect(docs.body).toHaveProperty([...operation, 'responses', '201']);
    expect(docs.body).toHaveProperty([...operation, 'responses', '200']);
  });
});
