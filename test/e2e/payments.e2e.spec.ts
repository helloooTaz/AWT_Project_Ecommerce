import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { Logger, type INestApplication } from '@nestjs/common';
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
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { MAIL_TRANSPORT } from '../../src/modules/mail/smtp.transport';
import { OrderItem } from '../../src/modules/orders/entities/order-item.entity';
import {
  Order,
  OrderStatus,
} from '../../src/modules/orders/entities/order.entity';
import { OrderExpiryScheduler } from '../../src/modules/orders/order-expiry.scheduler';
import { OrderExpiryService } from '../../src/modules/orders/order-expiry.service';
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
const cancellationPath = (orderId: string) =>
  `/api/v1/me/orders/${orderId}/cancel`;
const signatureHeader = 'X-Mock-Payment-Signature';
const secret = randomBytes(32).toString('hex');

describeWithPostgres('Payments and cancellation with PostgreSQL', () => {
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
  const sendMail = jest.fn<
    Promise<void>,
    [import('nodemailer').SendMailOptions]
  >();

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

  function cancel(orderId: string, token = owner.token) {
    return api().post(cancellationPath(orderId)).set('Authorization', token);
  }

  async function reservationFor(orderId: string) {
    const { id } = await db
      .getRepository(OrderItem)
      .findOneByOrFail({ orderId });
    return db
      .getRepository(StockReservation)
      .findOneByOrFail({ orderItemId: id });
  }

  async function expectOrderStock(
    orderId: string,
    orderStatus: OrderStatus,
    reservationStatus: StockReservationStatus,
    reserved: number,
  ) {
    expect(
      await db.getRepository(Order).findOneByOrFail({ id: orderId }),
    ).toMatchObject({ status: orderStatus });
    expect(await reservationFor(orderId)).toMatchObject({
      status: reservationStatus,
      quantity: 2,
    });
    expect(
      await db.getRepository(InventoryBalance).findOneByOrFail({ variantId }),
    ).toMatchObject({ onHand: 10, reserved });
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

  async function contendForOrderLock<T>(
    orderId: string,
    start: () => Promise<T>,
  ) {
    const blocker = db.createQueryRunner();
    let pending: Promise<PromiseSettledResult<T>[]>;
    let waiters = 0;
    try {
      await blocker.startTransaction();
      await app.get(OrdersService).lockForUpdate(blocker.manager, orderId);
      const [{ pid }] = await blocker.manager.query<{ pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      pending = Promise.allSettled([start()]);
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
    const [result] = await pending;
    if (result.status === 'rejected') throw result.reason;
    expect(waiters).toBeGreaterThanOrEqual(2);
    return result.value;
  }

  beforeAll(async () => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: randomBytes(32).toString('hex'),
      PAYMENT_PROVIDER: 'MOCK',
      MOCK_PAYMENT_SIGNING_SECRET: secret,
      ORDER_EXPIRY_ENABLED: 'false',
      ORDER_EXPIRY_BATCH_SIZE: '25',
    });
    const { AppModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue({ sendMail })
      .compile();
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
    sendMail.mockReset();
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
    expect(sendMail).not.toHaveBeenCalled();
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
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('sends one confirmation from stored snapshots after the payment and event have committed', async () => {
    const { orderId } = await checkout();
    const payment = await openPayment(orderId);
    const payload = event(payment);
    const anotherId = event(payment);
    const product = await db
      .getRepository(Product)
      .findOneByOrFail({ id: productId });
    const variant = await db
      .getRepository(ProductVariant)
      .findOneByOrFail({ id: variantId });
    const customer = await db
      .getRepository(User)
      .findOneByOrFail({ id: owner.id });
    await db
      .getRepository(Product)
      .update(productId, { name: 'Renamed Shirt' });
    await db.getRepository(ProductVariant).update(variantId, {
      color: 'Red',
      priceMinor: 1,
    });

    let stateAtSend:
      | { order: OrderStatus; payment: PaymentStatus; committedEvent: boolean }
      | undefined;
    sendMail.mockImplementationOnce(async () => {
      const [order, storedPayment, committedEvent] = await Promise.all([
        db.getRepository(Order).findOneByOrFail({ id: orderId }),
        db
          .getRepository(Payment)
          .findOneByOrFail({ providerRef: payment.providerRef }),
        db
          .getRepository(MockPaymentEvent)
          .existsBy({ eventId: payload.eventId }),
      ]);
      stateAtSend = {
        order: order.status,
        payment: storedPayment.status,
        committedEvent,
      };
    });
    try {
      await callback(payload).expect(200);
      await callback(payload).expect(200);
      await callback(anotherId).expect(200);
      expect(stateAtSend).toEqual({
        order: OrderStatus.CONFIRMED,
        payment: PaymentStatus.PAID,
        committedEvent: true,
      });
      expect(sendMail).toHaveBeenCalledTimes(1);
      const [message] = sendMail.mock.calls[0];
      expect(message.to).toEqual({ address: customer.email, name: '' });
      for (const body of [message.text, message.html]) {
        expect(body).toContain(customer.fullName);
        expect(body).toContain(orderId);
        expect(body).toContain('2 × Test Shirt (M, Blue)');
        expect(body).toContain('BDT 2,500.00');
        expect(body).not.toContain('Renamed Shirt');
        expect(body).not.toContain(payment.providerRef);
        expect(body).not.toContain('House 12');
      }
    } finally {
      await db.getRepository(Product).update(productId, { name: product.name });
      await db.getRepository(ProductVariant).update(variantId, {
        color: variant.color,
        priceMinor: variant.priceMinor,
      });
    }
  });

  it('keeps the payment, order and event committed when SMTP fails', async () => {
    const { orderId } = await checkout();
    const payment = await openPayment(orderId);
    const payload = event(payment);
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    sendMail.mockRejectedValueOnce(
      new Error('raw SMTP error with credentials'),
    );

    const response = await callback(payload).expect(200);
    expect(response.body).toHaveProperty('data', { duplicate: false });
    expect(warning).toHaveBeenCalledWith(
      `Order confirmation email failed for order ${orderId}`,
    );
    expect(warning.mock.calls.flat()).not.toContain(
      'raw SMTP error with credentials',
    );
    await expectState(
      orderId,
      OrderStatus.CONFIRMED,
      payment.providerRef,
      PaymentStatus.PAID,
    );
    const replay = await callback(payload).expect(200);
    expect(replay.body).toHaveProperty('data', { duplicate: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('commits only one terminal outcome when success and failure race', async () => {
    const { orderId } = await checkout();
    const payment = await openPayment(orderId);
    const success = event(payment);
    const failure = event(payment, PaymentStatus.FAILED);
    const [paid, failed] = await contendForOrderLock(orderId, () =>
      Promise.all([callback(success), callback(failure)]),
    );
    expect([paid.status, failed.status].sort()).toEqual([200, 409]);
    expect(sendMail).toHaveBeenCalledTimes(paid.status === 200 ? 1 : 0);
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
    expect(sendMail).not.toHaveBeenCalled();
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
    expect(sendMail).not.toHaveBeenCalled();
    await callback(event(retry)).expect(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
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
    expect(sendMail).not.toHaveBeenCalled();
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
    expect(sendMail).toHaveBeenCalledTimes(1);
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

  describe('Customer order cancellation', () => {
    it('cancels only the requested order and releases only its stock once', async () => {
      const first = await checkout();
      const second = await checkout();
      await expectOrderStock(
        first.orderId,
        OrderStatus.PENDING_PAYMENT,
        StockReservationStatus.ACTIVE,
        4,
      );

      const response = await cancel(first.orderId).expect(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { orderId: first.orderId, status: OrderStatus.CANCELLED },
      });
      await cancel(first.orderId).expect(409);
      await expectOrderStock(
        first.orderId,
        OrderStatus.CANCELLED,
        StockReservationStatus.RELEASED,
        2,
      );
      await expectOrderStock(
        second.orderId,
        OrderStatus.PENDING_PAYMENT,
        StockReservationStatus.ACTIVE,
        2,
      );
    });

    it('enforces JWT, customer role, ownership, and a valid order ID', async () => {
      const { orderId } = await checkout();
      await api().post(cancellationPath(orderId)).expect(401);
      await cancel(orderId, staff.token).expect(403);
      await cancel(orderId, other.token).expect(404);
      await cancel(randomUUID()).expect(404);
      await cancel('invalid-order-id').expect(400);
      await expectOrderStock(
        orderId,
        OrderStatus.PENDING_PAYMENT,
        StockReservationStatus.ACTIVE,
        2,
      );
    });

    it.each([
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.EXPIRED,
    ])('rejects %s orders', async (status) => {
      const { orderId } = await checkout();
      await db.getRepository(Order).update(orderId, { status });
      await cancel(orderId).expect(409);
      await expectOrderStock(orderId, status, StockReservationStatus.ACTIVE, 2);
    });

    it('rejects cancellation after a signed callback confirms the order', async () => {
      const { orderId } = await checkout();
      const payment = await openPayment(orderId);
      await callback(event(payment)).expect(200);
      await cancel(orderId).expect(409);
      await expectState(
        orderId,
        OrderStatus.CONFIRMED,
        payment.providerRef,
        PaymentStatus.PAID,
      );
      await expectOrderStock(
        orderId,
        OrderStatus.CONFIRMED,
        StockReservationStatus.ACTIVE,
        2,
      );
    });

    it('cancels an unpaid order whose reservations were already released', async () => {
      const { orderId } = await checkout();
      await db.transaction(async (manager) => {
        await app.get(OrdersService).lockForUpdate(manager, orderId);
        await app.get(InventoryService).releaseForOrder(manager, orderId);
      });
      await expectOrderStock(
        orderId,
        OrderStatus.PENDING_PAYMENT,
        StockReservationStatus.RELEASED,
        0,
      );
      await cancel(orderId).expect(200);
      await expectOrderStock(
        orderId,
        OrderStatus.CANCELLED,
        StockReservationStatus.RELEASED,
        0,
      );
    });

    it('rejects release when a balance cannot cover its reservation', async () => {
      const { orderId } = await checkout();
      await db
        .getRepository(InventoryBalance)
        .update({ variantId }, { reserved: 1 });
      await cancel(orderId).expect(409);
      await expectOrderStock(
        orderId,
        OrderStatus.PENDING_PAYMENT,
        StockReservationStatus.ACTIVE,
        1,
      );
    });

    it('releases stock once when two cancellation requests contend on the order lock', async () => {
      const { orderId } = await checkout();
      const responses = await contendForOrderLock(orderId, () =>
        Promise.all([cancel(orderId), cancel(orderId)]),
      );
      expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
      await expectOrderStock(
        orderId,
        OrderStatus.CANCELLED,
        StockReservationStatus.RELEASED,
        0,
      );
    }, 15000);

    it('serializes cancellation against a concurrent successful payment callback', async () => {
      const { orderId } = await checkout();
      const payment = await openPayment(orderId);
      const payload = event(payment);
      const [cancelled, paid] = await contendForOrderLock(orderId, () =>
        Promise.all([cancel(orderId), callback(payload)]),
      );
      expect([cancelled.status, paid.status].sort()).toEqual([200, 409]);
      const paymentWon = paid.status === 200;
      const orderStatus = paymentWon
        ? OrderStatus.CONFIRMED
        : OrderStatus.CANCELLED;
      await expectState(
        orderId,
        orderStatus,
        payment.providerRef,
        paymentWon ? PaymentStatus.PAID : PaymentStatus.PENDING,
      );
      await expectOrderStock(
        orderId,
        orderStatus,
        paymentWon
          ? StockReservationStatus.ACTIVE
          : StockReservationStatus.RELEASED,
        paymentWon ? 2 : 0,
      );
      expect(
        await db
          .getRepository(MockPaymentEvent)
          .existsBy({ eventId: payload.eventId }),
      ).toBe(paymentWon);
    }, 15000);

    it('serializes cancellation against a concurrent failed payment callback', async () => {
      const { orderId } = await checkout();
      const payment = await openPayment(orderId);
      const payload = event(payment, PaymentStatus.FAILED);
      const [cancelled, failed] = await contendForOrderLock(orderId, () =>
        Promise.all([cancel(orderId), callback(payload)]),
      );
      expect(cancelled.status).toBe(200);
      expect([200, 409]).toContain(failed.status);
      const failureRecorded = failed.status === 200;
      await expectState(
        orderId,
        OrderStatus.CANCELLED,
        payment.providerRef,
        failureRecorded ? PaymentStatus.FAILED : PaymentStatus.PENDING,
      );
      await expectOrderStock(
        orderId,
        OrderStatus.CANCELLED,
        StockReservationStatus.RELEASED,
        0,
      );
      expect(
        await db
          .getRepository(MockPaymentEvent)
          .existsBy({ eventId: payload.eventId }),
      ).toBe(failureRecorded);
    }, 15000);

    it('rejects new payment sessions and both late callback outcomes after cancellation', async () => {
      const { orderId } = await checkout();
      const payment = await openPayment(orderId);
      await cancel(orderId).expect(200);
      await session(orderId).expect(409);
      const success = event(payment);
      const failure = event(payment, PaymentStatus.FAILED);
      await callback(success).expect(409);
      await callback(failure).expect(409);
      expect(sendMail).not.toHaveBeenCalled();
      await expectState(
        orderId,
        OrderStatus.CANCELLED,
        payment.providerRef,
        PaymentStatus.PENDING,
      );
      await expectOrderStock(
        orderId,
        OrderStatus.CANCELLED,
        StockReservationStatus.RELEASED,
        0,
      );
      expect(
        await db
          .getRepository(MockPaymentEvent)
          .countBy({ eventId: In([success.eventId, failure.eventId]) }),
      ).toBe(0);
    });

    it('still deduplicates a previously accepted failure after cancellation', async () => {
      const { orderId } = await checkout();
      const payment = await openPayment(orderId);
      const failure = event(payment, PaymentStatus.FAILED);
      await callback(failure).expect(200);
      await cancel(orderId).expect(200);
      const replay = await callback(failure).expect(200);
      expect(replay.body).toHaveProperty('data.duplicate', true);
      await expectState(
        orderId,
        OrderStatus.CANCELLED,
        payment.providerRef,
        PaymentStatus.FAILED,
      );
    });

    it.each(['reservation release', 'order update'] as const)(
      'rolls back cancellation and stock changes when PostgreSQL rejects the %s',
      async (operation) => {
        const { orderId } = await checkout();
        const reservation = await reservationFor(orderId);
        const release = operation === 'reservation release';
        const table = release ? 'stock_reservations' : 'orders';
        const id = release ? reservation.id : orderId;
        const status = release
          ? StockReservationStatus.RELEASED
          : OrderStatus.CANCELLED;
        // The UUID comes from the fixture; the constraint only blocks that row.
        await db.query(`ALTER TABLE ${table} ADD CONSTRAINT ck_cancel_test_write
          CHECK (id <> '${id}'::uuid OR status <> '${status}') NOT VALID`);
        try {
          await cancel(orderId).expect(500);
          await expectOrderStock(
            orderId,
            OrderStatus.PENDING_PAYMENT,
            StockReservationStatus.ACTIVE,
            2,
          );
          expect(await reservationFor(orderId)).toEqual(reservation);
        } finally {
          await db.query(
            `ALTER TABLE ${table} DROP CONSTRAINT ck_cancel_test_write`,
          );
        }
        await cancel(orderId).expect(200);
        await expectOrderStock(
          orderId,
          OrderStatus.CANCELLED,
          StockReservationStatus.RELEASED,
          0,
        );
      },
      15000,
    );

    it('documents the cancellation endpoint, bearer authentication, and conflicts', async () => {
      const docs = await api().get('/api/docs-json').expect(200);
      const operation = ['paths', cancellationPath('{id}'), 'post'];
      expect(docs.body).toHaveProperty(
        [...operation, 'security'],
        [{ bearer: [] }],
      );
      expect(docs.body).toHaveProperty([...operation, 'responses', '200']);
      expect(docs.body).toHaveProperty([...operation, 'responses', '409']);
    });
  });

  describe('Automatic order expiry', () => {
    async function reachDeadline(orderId: string) {
      const { id } = await reservationFor(orderId);
      await db.query(
        'UPDATE stock_reservations SET expires_at = clock_timestamp() WHERE id = $1',
        [id],
      );
    }

    it('expires unpaid orders at their reservation deadline and leaves future orders alone', async () => {
      const due = await checkout();
      const future = await checkout();
      await reachDeadline(due.orderId);
      const worker = app.get(OrderExpiryService);
      expect(await worker.processBatch()).toBe(1);
      expect(await worker.processBatch()).toBe(0);
      await expectOrderStock(
        due.orderId,
        OrderStatus.EXPIRED,
        StockReservationStatus.RELEASED,
        2,
      );
      await expectOrderStock(
        future.orderId,
        OrderStatus.PENDING_PAYMENT,
        StockReservationStatus.ACTIVE,
        2,
      );
    });

    it('picks up an existing overdue order when scheduling starts', async () => {
      const { orderId } = await checkout();
      await reachDeadline(orderId);
      const config = app.get<ConfigService<Environment, true>>(ConfigService);
      const scheduler = app.get(OrderExpiryScheduler);
      config.set('ORDER_EXPIRY_ENABLED', true);
      try {
        scheduler.onApplicationBootstrap();
        await scheduler.onModuleDestroy();
      } finally {
        config.set('ORDER_EXPIRY_ENABLED', false);
      }
      await expectOrderStock(
        orderId,
        OrderStatus.EXPIRED,
        StockReservationStatus.RELEASED,
        0,
      );
    });

    it.each([
      OrderStatus.CONFIRMED,
      OrderStatus.CANCELLED,
      OrderStatus.EXPIRED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ])(
      'leaves %s orders alone even when their reservations have elapsed',
      async (status) => {
        const { orderId } = await checkout();
        await db.getRepository(Order).update(orderId, { status });
        await reachDeadline(orderId);
        const worker = app.get(OrderExpiryService);
        expect(await worker.processBatch()).toBe(0);
        expect(await worker.expireOrder(orderId)).toBe(false);
        await expectOrderStock(
          orderId,
          status,
          StockReservationStatus.ACTIVE,
          2,
        );
      },
    );

    it('rejects a new payment session, late callbacks, and cancellation after expiry', async () => {
      const { orderId } = await checkout();
      const payment = await openPayment(orderId);
      const acceptedFailure = event(payment, PaymentStatus.FAILED);
      await callback(acceptedFailure).expect(200);
      const pendingAttempt = await openPayment(orderId);
      await reachDeadline(orderId);
      expect(await app.get(OrderExpiryService).processBatch()).toBe(1);
      await session(orderId).expect(409);
      await cancel(orderId).expect(409);
      const success = event(pendingAttempt);
      const failure = event(pendingAttempt, PaymentStatus.FAILED);
      await callback(success).expect(409);
      await callback(failure).expect(409);
      const replay = await callback(acceptedFailure).expect(200);
      expect(replay.body).toHaveProperty('data.duplicate', true);
      expect(sendMail).not.toHaveBeenCalled();
      await expectState(
        orderId,
        OrderStatus.EXPIRED,
        payment.providerRef,
        PaymentStatus.FAILED,
      );
      await expectState(
        orderId,
        OrderStatus.EXPIRED,
        pendingAttempt.providerRef,
        PaymentStatus.PENDING,
      );
      await expectOrderStock(
        orderId,
        OrderStatus.EXPIRED,
        StockReservationStatus.RELEASED,
        0,
      );
      expect(
        await db
          .getRepository(MockPaymentEvent)
          .countBy({ eventId: In([success.eventId, failure.eventId]) }),
      ).toBe(0);
    });

    it('rejects successful payment at the database deadline before the worker runs', async () => {
      const { orderId } = await checkout();
      const payment = await openPayment(orderId);
      await reachDeadline(orderId);
      await callback(event(payment)).expect(409);
      await expectState(
        orderId,
        OrderStatus.PENDING_PAYMENT,
        payment.providerRef,
        PaymentStatus.PENDING,
      );
      expect(await app.get(OrderExpiryService).processBatch()).toBe(1);
      await expectOrderStock(
        orderId,
        OrderStatus.EXPIRED,
        StockReservationStatus.RELEASED,
        0,
      );
    });

    it('releases stock once when two expiry workers contend for the same order', async () => {
      const { orderId } = await checkout();
      await reachDeadline(orderId);
      const first = app.get(OrderExpiryService);
      const second = new OrderExpiryService(
        db,
        app.get(OrdersService),
        app.get(InventoryService),
        app.get(ConfigService),
      );
      const results = await contendForOrderLock(orderId, () =>
        Promise.all([first.processBatch(), second.processBatch()]),
      );
      expect(results.sort()).toEqual([0, 1]);
      await expectOrderStock(
        orderId,
        OrderStatus.EXPIRED,
        StockReservationStatus.RELEASED,
        0,
      );
    }, 15000);

    it.each(['before', 'after'] as const)(
      'serializes expiry against a concurrent successful payment %s the deadline',
      async (timing) => {
        const { orderId } = await checkout();
        const payment = await openPayment(orderId);
        const due = timing === 'after';
        if (due) await reachDeadline(orderId);
        const [expired, paid] = await contendForOrderLock(orderId, () =>
          Promise.all([
            app.get(OrderExpiryService).expireOrder(orderId),
            callback(event(payment)),
          ]),
        );
        expect(expired).toBe(due);
        expect(paid.status).toBe(due ? 409 : 200);
        const status = due ? OrderStatus.EXPIRED : OrderStatus.CONFIRMED;
        await expectState(
          orderId,
          status,
          payment.providerRef,
          due ? PaymentStatus.PENDING : PaymentStatus.PAID,
        );
        await expectOrderStock(
          orderId,
          status,
          due ? StockReservationStatus.RELEASED : StockReservationStatus.ACTIVE,
          due ? 0 : 2,
        );
      },
      15000,
    );

    it('serializes expiry against a concurrent failed payment callback', async () => {
      const { orderId } = await checkout();
      const payment = await openPayment(orderId);
      await reachDeadline(orderId);
      const failure = event(payment, PaymentStatus.FAILED);
      const [expired, failed] = await contendForOrderLock(orderId, () =>
        Promise.all([
          app.get(OrderExpiryService).expireOrder(orderId),
          callback(failure),
        ]),
      );
      expect(expired).toBe(true);
      expect([200, 409]).toContain(failed.status);
      const recorded = failed.status === 200;
      await expectState(
        orderId,
        OrderStatus.EXPIRED,
        payment.providerRef,
        recorded ? PaymentStatus.FAILED : PaymentStatus.PENDING,
      );
      await expectOrderStock(
        orderId,
        OrderStatus.EXPIRED,
        StockReservationStatus.RELEASED,
        0,
      );
      expect(
        await db
          .getRepository(MockPaymentEvent)
          .existsBy({ eventId: failure.eventId }),
      ).toBe(recorded);
    }, 15000);

    it('serializes expiry against concurrent cancellation without releasing twice', async () => {
      const { orderId } = await checkout();
      await reachDeadline(orderId);
      const [expired, cancelled] = await contendForOrderLock(orderId, () =>
        Promise.all([
          app.get(OrderExpiryService).expireOrder(orderId),
          cancel(orderId),
        ]),
      );
      expect(cancelled.status).toBe(expired ? 409 : 200);
      await expectOrderStock(
        orderId,
        expired ? OrderStatus.EXPIRED : OrderStatus.CANCELLED,
        StockReservationStatus.RELEASED,
        0,
      );
    }, 15000);

    it('respects the batch limit, rolls back a failed release, and retries it after other orders', async () => {
      const config = app.get<ConfigService<Environment, true>>(ConfigService);
      const limit = config.get('ORDER_EXPIRY_BATCH_SIZE', { infer: true });
      const [blocked, healthy] = [
        (await checkout()).orderId,
        (await checkout()).orderId,
      ].sort();
      await reachDeadline(blocked);
      await reachDeadline(healthy);
      const reservation = await reservationFor(blocked);
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      const worker = app.get(OrderExpiryService);
      config.set('ORDER_EXPIRY_BATCH_SIZE', 1);
      try {
        await db.query(`ALTER TABLE stock_reservations ADD CONSTRAINT ck_expiry_test_release
          CHECK (id <> '${reservation.id}'::uuid OR status <> 'RELEASED') NOT VALID`);
        try {
          expect(await worker.processBatch()).toBe(0);
          expect(warn).toHaveBeenCalledWith(
            'An order expiry transaction failed and will be retried',
          );
          expect(await reservationFor(blocked)).toEqual(reservation);
          await expectOrderStock(
            blocked,
            OrderStatus.PENDING_PAYMENT,
            StockReservationStatus.ACTIVE,
            4,
          );
          await expectOrderStock(
            healthy,
            OrderStatus.PENDING_PAYMENT,
            StockReservationStatus.ACTIVE,
            4,
          );

          expect(await worker.processBatch()).toBe(1);
          await expectOrderStock(
            healthy,
            OrderStatus.EXPIRED,
            StockReservationStatus.RELEASED,
            2,
          );
          await expectOrderStock(
            blocked,
            OrderStatus.PENDING_PAYMENT,
            StockReservationStatus.ACTIVE,
            2,
          );
        } finally {
          await db.query(
            'ALTER TABLE stock_reservations DROP CONSTRAINT ck_expiry_test_release',
          );
        }
        expect(await worker.processBatch()).toBe(1);
        await expectOrderStock(
          blocked,
          OrderStatus.EXPIRED,
          StockReservationStatus.RELEASED,
          0,
        );
      } finally {
        config.set('ORDER_EXPIRY_BATCH_SIZE', limit);
      }
    }, 15000);

    it('rolls back the release if PostgreSQL rejects the order transition', async () => {
      const { orderId } = await checkout();
      await reachDeadline(orderId);
      const worker = app.get(OrderExpiryService);
      await db.query(`ALTER TABLE orders ADD CONSTRAINT ck_expiry_test_order
        CHECK (id <> '${orderId}'::uuid OR status <> 'EXPIRED') NOT VALID`);
      try {
        await expect(worker.expireOrder(orderId)).rejects.toMatchObject({
          driverError: { code: '23514' },
        });
        await expectOrderStock(
          orderId,
          OrderStatus.PENDING_PAYMENT,
          StockReservationStatus.ACTIVE,
          2,
        );
      } finally {
        await db.query(
          'ALTER TABLE orders DROP CONSTRAINT ck_expiry_test_order',
        );
      }
      expect(await worker.processBatch()).toBe(1);
      await expectOrderStock(
        orderId,
        OrderStatus.EXPIRED,
        StockReservationStatus.RELEASED,
        0,
      );
    }, 15000);
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
