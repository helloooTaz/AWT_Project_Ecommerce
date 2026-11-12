import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import type { Environment } from '../../src/config/env.validation';
import { Address } from '../../src/modules/addresses/entities/address.entity';
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
import { OrdersService } from '../../src/modules/orders/orders.service';
import type { MockPaymentEventDto } from '../../src/modules/payments/dto/mock-payment-event.dto';
import { MockPaymentEvent } from '../../src/modules/payments/entities/mock-payment-event.entity';
import {
  Payment,
  PaymentStatus,
} from '../../src/modules/payments/entities/payment.entity';
import { UserRole } from '../../src/modules/roles/user-role.enum';
import { User } from '../../src/modules/users/entities/user.entity';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;
const webhookPath = '/api/v1/webhooks/payments/mock';
const sessionPath = (orderId: string) =>
  `/api/v1/orders/${orderId}/payment-session`;
const signatureHeader = 'X-Mock-Payment-Signature';
const secret = randomBytes(32).toString('hex');

describeWithPostgres('Mock payments with PostgreSQL', () => {
  let app: INestApplication<Server>;
  let db: DataSource;
  let owner: { id: string; token: string };
  let other: { id: string; token: string };
  let staff: { id: string; token: string };
  let categoryId: string;
  let productId: string;
  let variantId: string;
  let addressId: string;
  const userIds: string[] = [];
  const eventIds: string[] = [];

  function api() {
    return request(app.getHttpServer());
  }

  async function createUser(role = UserRole.CUSTOMER) {
    const user = await db.getRepository(User).save({
      role,
      email: `payment-${randomUUID()}@example.com`,
      fullName: 'Payment Test',
      passwordHash: 'unused-for-signed-jwt-fixtures',
    });
    userIds.push(user.id);
    const jwt = await app.get(JwtService).signAsync({ sub: user.id });
    return { id: user.id, token: `Bearer ${jwt}` };
  }

  async function checkout() {
    await api()
      .post('/api/v1/me/cart/items')
      .set('Authorization', owner.token)
      .send({ variantId, quantity: 2 })
      .expect(201);
    const response = await api()
      .post('/api/v1/checkout')
      .set('Authorization', owner.token)
      .set('Idempotency-Key', randomUUID())
      .send({ addressId })
      .expect(201);
    return (response.body as { data: { orderId: string; totalMinor: string } })
      .data;
  }

  function session(orderId: string, token = owner.token) {
    return api().post(sessionPath(orderId)).set('Authorization', token);
  }

  async function openPayment(orderId: string) {
    const response = await session(orderId).expect(200);
    return (
      response.body as { data: { providerRef: string; amountMinor: string } }
    ).data;
  }

  function event(
    payment: Pick<Payment, 'amountMinor'> & { providerRef: string },
    status: MockPaymentEventDto['status'] = PaymentStatus.PAID,
  ): MockPaymentEventDto {
    const eventId = randomUUID();
    eventIds.push(eventId);
    return {
      eventId,
      providerRef: payment.providerRef,
      amountMinor: payment.amountMinor,
      status,
    };
  }

  function sign(body: string) {
    return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  }

  function send(body: string, signature: string | null = sign(body)) {
    const req = api().post(webhookPath).type('json').send(body);
    return signature === null ? req : req.set(signatureHeader, signature);
  }

  function callback(body: MockPaymentEventDto) {
    return send(JSON.stringify(body));
  }

  async function expectState(
    orderId: string,
    orderStatus: OrderStatus,
    providerRef: string,
    paymentStatus: PaymentStatus,
  ) {
    expect(
      await db.getRepository(Order).findOneByOrFail({ id: orderId }),
    ).toMatchObject({ status: orderStatus });
    expect(
      await db.getRepository(Payment).findOneByOrFail({ providerRef }),
    ).toMatchObject({ status: paymentStatus });
  }

  beforeAll(async () => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: randomBytes(32).toString('hex'),
      PAYMENT_PROVIDER: 'MOCK',
      MOCK_PAYMENT_SIGNING_SECRET: secret,
    });
    const { AppModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>({
      rawBody: true,
    });
    configureApp(app, true);
    await app.init();
    db = app.get(DataSource);
    if (await db.showMigrations()) {
      throw new Error('Apply migrations to TEST_DATABASE_URL before testing');
    }

    [owner, other, staff] = await Promise.all([
      createUser(),
      createUser(),
      createUser(UserRole.STAFF),
    ]);
    const address = await db.getRepository(Address).save({
      userId: owner.id,
      recipient: 'Samira Rahman',
      phone: '+8801712345678',
      addressLine1: 'House 12, Road 5',
      city: 'Dhaka',
    });
    addressId = address.id;
    const category = await db.getRepository(Category).save({
      name: 'Payment Test Shirts',
      slug: `payment-shirts-${randomUUID()}`,
    });
    categoryId = category.id;
    const product = await db.getRepository(Product).save({
      categoryId,
      name: 'Test Shirt',
      slug: `payment-shirt-${randomUUID()}`,
      description: 'Mock payment fixture',
      status: ProductStatus.PUBLISHED,
    });
    productId = product.id;
    const variant = await db.getRepository(ProductVariant).save({
      productId,
      sku: `SHIRT-${randomUUID()}`,
      size: 'M',
      color: 'Blue',
      priceMinor: 125000,
    });
    variantId = variant.id;
    await db
      .getRepository(InventoryBalance)
      .insert({ variantId, onHand: 10, reserved: 0 });
  }, 20000);

  afterEach(async () => {
    jest.restoreAllMocks();
    if (!db?.isInitialized || !owner || !variantId) {
      return;
    }
    const orders = await db.getRepository(Order).findBy({ userId: owner.id });
    const orderIds = In(orders.map(({ id }) => id));
    await db
      .getRepository(MockPaymentEvent)
      .delete({ eventId: In(eventIds.splice(0)) });
    await db.getRepository(Payment).delete({ orderId: orderIds });
    await db.getRepository(IdempotencyRecord).delete({ orderId: orderIds });
    await db.getRepository(StockReservation).delete({ variantId });
    await db.getRepository(OrderItem).delete({ orderId: orderIds });
    await db.getRepository(Order).delete({ id: orderIds });
    await db.getRepository(Cart).delete({ userId: owner.id });
    await db
      .getRepository(InventoryBalance)
      .update({ variantId }, { onHand: 10, reserved: 0 });
  });

  afterAll(async () => {
    try {
      if (!db?.isInitialized) {
        return;
      }
      if (variantId) {
        await db.getRepository(InventoryBalance).delete({ variantId });
        await db.getRepository(ProductVariant).delete(variantId);
      }
      if (productId) await db.getRepository(Product).delete(productId);
      if (categoryId) await db.getRepository(Category).delete(categoryId);
      await db.getRepository(Address).delete({ userId: In(userIds) });
      await db.getRepository(User).delete({ id: In(userIds) });
    } finally {
      await app?.close();
    }
  });

  it('creates one owned session from the stored total under concurrent retries', async () => {
    const { orderId, totalMinor } = await checkout();
    const [first, second] = await Promise.all([
      session(orderId).expect(200),
      session(orderId).expect(200),
    ]);
    const reservation = await db
      .getRepository(StockReservation)
      .findOneByOrFail({ variantId });
    expect(first.body).toMatchObject({
      success: true,
      data: {
        provider: 'MOCK',
        status: PaymentStatus.PENDING,
        amountMinor: totalMinor,
        currency: 'BDT',
        expiresAt: reservation.expiresAt.toISOString(),
      },
    });
    expect(second.body).toHaveProperty(
      'data',
      (first.body as { data: unknown }).data,
    );
    expect(await db.getRepository(Payment).findBy({ orderId })).toMatchObject([
      {
        status: PaymentStatus.PENDING,
        amountMinor: totalMinor,
        provider: 'MOCK',
      },
    ]);
  });

  it('rejects unauthenticated, wrong-role, missing, and other-owned requests', async () => {
    const { orderId } = await checkout();
    await api().post(sessionPath(orderId)).expect(401);
    await session(orderId, staff.token).expect(403);
    await session(orderId, other.token).expect(404);
    await session(randomUUID()).expect(404);
    await session('not-an-id').expect(400);
    await session(orderId).send({ amountMinor: '1' }).expect(400);
    expect(await db.getRepository(Payment).countBy({ orderId })).toBe(0);
  });

  it.each([OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.PROCESSING])(
    'rejects payment sessions and success callbacks for %s orders',
    async (status) => {
      const { orderId } = await checkout();
      const payment = await openPayment(orderId);
      await db.getRepository(Order).update(orderId, { status });
      await session(orderId).expect(409);
      await callback(event(payment)).expect(409);
      await expectState(
        orderId,
        status,
        payment.providerRef,
        PaymentStatus.PENDING,
      );
    },
  );

  it('rejects missing and invalid signatures, including a body modified after signing', async () => {
    const { orderId } = await checkout();
    const payment = await openPayment(orderId);
    const payload = event(payment);
    const compact = JSON.stringify(payload);
    const formatted = JSON.stringify(payload, null, 2);
    await send(compact, null).set('Authorization', owner.token).expect(401);
    await send(compact, 'not-a-digest').expect(401);
    await send(compact, '0'.repeat(64)).expect(401);
    await send(formatted, sign(compact)).expect(401);
    await expectState(
      orderId,
      OrderStatus.PENDING_PAYMENT,
      payment.providerRef,
      PaymentStatus.PENDING,
    );
    expect(
      await db
        .getRepository(MockPaymentEvent)
        .existsBy({ eventId: payload.eventId }),
    ).toBe(false);
    await send(formatted).expect(200);
    await expectState(
      orderId,
      OrderStatus.CONFIRMED,
      payment.providerRef,
      PaymentStatus.PAID,
    );
  });

  it('validates signed DTOs and the callback amount before changing state', async () => {
    const { orderId } = await checkout();
    const payment = await openPayment(orderId);
    const payload = event(payment);
    await send('[]').expect(400);
    await send(JSON.stringify({ ...payload, paid: true })).expect(400);
    await send(JSON.stringify({ ...payload, amountMinor: 250000 })).expect(400);
    await callback({ ...payload, amountMinor: '1' }).expect(409);
    await callback({ ...payload, providerRef: randomUUID() }).expect(404);
    await expectState(
      orderId,
      OrderStatus.PENDING_PAYMENT,
      payment.providerRef,
      PaymentStatus.PENDING,
    );
    expect(
      await db
        .getRepository(MockPaymentEvent)
        .existsBy({ eventId: payload.eventId }),
    ).toBe(false);
    await callback(payload).expect(200);
  });

  it('hides both mock endpoints outside explicitly configured MOCK mode', async () => {
    const { orderId } = await checkout();
    const config = app.get<ConfigService<Environment, true>>(ConfigService);
    config.set('PAYMENT_PROVIDER', 'DISABLED');
    try {
      await session(orderId).expect(404);
      await callback(
        event({ providerRef: randomUUID(), amountMinor: '250000' }),
      ).expect(404);
      expect(await db.getRepository(Payment).countBy({ orderId })).toBe(0);
    } finally {
      config.set('PAYMENT_PROVIDER', 'MOCK');
    }
  });

  it('confirms the exact BIGINT amount and leaves reservations and inventory intact', async () => {
    const { orderId } = await checkout();
    const totalMinor = '9223372036854775806';
    await db.getRepository(Order).update(orderId, { totalMinor });
    await db.getRepository(OrderItem).update(
      { orderId },
      {
        unitPriceMinor: '4611686018427387903',
        lineTotalMinor: totalMinor,
      },
    );
    const payment = await openPayment(orderId);
    expect(payment.amountMinor).toBe(totalMinor);
    const reservation = await db
      .getRepository(StockReservation)
      .findOneByOrFail({ variantId });
    await callback(event(payment)).expect(200);
    await expectState(
      orderId,
      OrderStatus.CONFIRMED,
      payment.providerRef,
      PaymentStatus.PAID,
    );
    expect(
      await db.getRepository(StockReservation).findOneByOrFail({ variantId }),
    ).toEqual(reservation);
    expect(reservation.status).toBe(StockReservationStatus.ACTIVE);
    expect(
      await db.getRepository(InventoryBalance).findOneByOrFail({ variantId }),
    ).toMatchObject({ onHand: 10, reserved: 2 });
    await session(orderId).expect(409);
  });

  it('deduplicates concurrent replays and rejects an event ID reused with different fields', async () => {
    const { orderId } = await checkout();
    const payment = await openPayment(orderId);
    const payload = event(payment);
    const responses = await Promise.all([
      callback(payload).expect(200),
      callback(payload).expect(200),
    ]);
    const results = responses.map(
      ({ body }) => (body as { data: { duplicate: boolean } }).data.duplicate,
    );
    expect(results.sort()).toEqual([false, true]);
    expect(
      await db
        .getRepository(MockPaymentEvent)
        .countBy({ eventId: payload.eventId }),
    ).toBe(1);
    await callback({ ...payload, status: PaymentStatus.FAILED }).expect(409);
    await expectState(
      orderId,
      OrderStatus.CONFIRMED,
      payment.providerRef,
      PaymentStatus.PAID,
    );
    await callback(event(payment))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveProperty('data.duplicate', false);
      });
  });

  it('commits only one terminal outcome when success and failure race', async () => {
    const { orderId } = await checkout();
    const payment = await openPayment(orderId);
    const success = event(payment);
    const failure = event(payment, PaymentStatus.FAILED);
    const blocker = db.createQueryRunner();
    let pending: Promise<PromiseSettledResult<request.Response>[]>;
    let waiters = 0;
    try {
      await blocker.startTransaction();
      await app.get(OrdersService).lockForPayment(blocker.manager, orderId);
      const [{ pid }] = await blocker.manager.query<{ pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      pending = Promise.allSettled([callback(success), callback(failure)]);
      for (let attempt = 0; attempt < 150 && waiters < 2; attempt++) {
        const [{ count }] = await db.query<{ count: number }[]>(
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
        waiters = count;
        if (waiters < 2) await delay(20);
      }
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
    }
    const [paid, failed] = (await pending).map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    });
    expect(waiters).toBeGreaterThanOrEqual(2);
    expect([paid.status, failed.status].sort()).toEqual([200, 409]);
    const accepted = paid.status === 200 ? success : failure;
    const orderStatus =
      paid.status === 200 ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT;
    await expectState(
      orderId,
      orderStatus,
      payment.providerRef,
      accepted.status,
    );
    await callback(accepted)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveProperty('data.duplicate', true);
      });
    expect(
      await db
        .getRepository(MockPaymentEvent)
        .countBy({ eventId: In([success.eventId, failure.eventId]) }),
    ).toBe(1);
  }, 15000);

  it('preserves the order and reservation on failure and creates a fresh attempt on retry', async () => {
    const { orderId } = await checkout();
    const first = await openPayment(orderId);
    const reservation = await db
      .getRepository(StockReservation)
      .findOneByOrFail({ variantId });
    await callback(event(first, PaymentStatus.FAILED)).expect(200);
    await expectState(
      orderId,
      OrderStatus.PENDING_PAYMENT,
      first.providerRef,
      PaymentStatus.FAILED,
    );
    expect(
      await db.getRepository(StockReservation).findOneByOrFail({ variantId }),
    ).toEqual(reservation);
    const retry = await openPayment(orderId);
    expect(retry.providerRef).not.toBe(first.providerRef);
    await callback(event(first)).expect(409);
    await callback(event(retry)).expect(200);
    await expectState(
      orderId,
      OrderStatus.CONFIRMED,
      retry.providerRef,
      PaymentStatus.PAID,
    );
    expect(await db.getRepository(Payment).countBy({ orderId })).toBe(2);
  });

  it.each(['expired', 'released', 'missing', 'wrong quantity'])(
    'rejects session creation and late success with a %s reservation',
    async (state) => {
      const { orderId } = await checkout();
      const payment = await openPayment(orderId);
      const reservations = db.getRepository(StockReservation);
      if (state === 'missing') {
        await reservations.delete({ variantId });
      } else {
        const changes = {
          expired: { expiresAt: new Date(Date.now() - 1000) },
          released: { status: StockReservationStatus.RELEASED },
          'wrong quantity': { quantity: 1 },
        };
        await reservations.update(
          { variantId },
          changes[state as keyof typeof changes],
        );
      }
      await session(orderId).expect(409);
      await callback(event(payment)).expect(409);
      await expectState(
        orderId,
        OrderStatus.PENDING_PAYMENT,
        payment.providerRef,
        PaymentStatus.PENDING,
      );
    },
  );

  it('rolls back the payment and event record if the order update fails', async () => {
    const { orderId } = await checkout();
    const payment = await openPayment(orderId);
    const payload = event(payment);
    let sawTransactionalWrites = false;
    jest
      .spyOn(app.get(OrdersService), 'confirmPayment')
      .mockImplementationOnce(async (manager) => {
        const row = await manager
          .getRepository(Payment)
          .findOneByOrFail({ providerRef: payment.providerRef });
        const recorded = await manager
          .getRepository(MockPaymentEvent)
          .existsBy({ eventId: payload.eventId });
        sawTransactionalWrites = row.status === PaymentStatus.PAID && recorded;
        await manager.query('SELECT 1 / 0');
      });
    await callback(payload).expect(500);
    expect(sawTransactionalWrites).toBe(true);
    await expectState(
      orderId,
      OrderStatus.PENDING_PAYMENT,
      payment.providerRef,
      PaymentStatus.PENDING,
    );
    expect(
      await db
        .getRepository(MockPaymentEvent)
        .existsBy({ eventId: payload.eventId }),
    ).toBe(false);
    await callback(payload).expect(200);
    await expectState(
      orderId,
      OrderStatus.CONFIRMED,
      payment.providerRef,
      PaymentStatus.PAID,
    );
  });

  it('documents bearer access and the distinct provider signature header in Swagger', async () => {
    const docs = await api().get('/api/docs-json').expect(200);
    expect(docs.body).toHaveProperty(
      ['paths', sessionPath('{id}'), 'post', 'security'],
      [{ bearer: [] }],
    );
    expect(docs.body).toHaveProperty(
      ['paths', webhookPath, 'post', 'parameters'],
      expect.arrayContaining([
        expect.objectContaining({
          name: signatureHeader,
          in: 'header',
          required: true,
        }),
      ]),
    );
  });

  it('rate-limits callbacks from the same peer despite different forwarded IP headers', async () => {
    const responses = await Promise.all(
      Array.from({ length: 61 }, (_, index) =>
        send('{}', null).set('X-Forwarded-For', `192.0.2.${index + 1}`),
      ),
    );
    expect(
      responses.every(({ status }) => status === 401 || status === 429),
    ).toBe(true);
    expect(responses.some(({ status }) => status === 429)).toBe(true);
  });
});
