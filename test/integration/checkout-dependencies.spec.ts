import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource, In, type EntityManager } from 'typeorm';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { ProductVariant } from '../../src/modules/catalog/entities/product-variant.entity';
import {
  Product,
  ProductStatus,
} from '../../src/modules/catalog/entities/product.entity';
import { Category } from '../../src/modules/categories/entities/category.entity';
import { InventoryBalance } from '../../src/modules/inventory/entities/inventory-balance.entity';
import {
  StockReservation,
  StockReservationStatus,
} from '../../src/modules/inventory/entities/stock-reservation.entity';
import {
  InventoryService,
  type StockReservationItem,
} from '../../src/modules/inventory/inventory.service';
import { OrderItem } from '../../src/modules/orders/entities/order-item.entity';
import {
  Order,
  OrderStatus,
} from '../../src/modules/orders/entities/order.entity';
import { OrderExpiryService } from '../../src/modules/orders/order-expiry.service';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { User } from '../../src/modules/users/entities/user.entity';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;

describeWithPostgres('Checkout dependencies with PostgreSQL', () => {
  let module: TestingModule;
  let db: DataSource;
  let catalog: CatalogService;
  let inventory: InventoryService;
  let userId: string;
  let categoryId: string;
  let expiresAt: Date;
  const orderIds: string[] = [];
  const orderItemIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];

  beforeAll(async () => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: randomBytes(32).toString('hex'),
    });
    const { AppModule } = await import('../../src/app.module');
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    db = module.get(DataSource);
    catalog = module.get(CatalogService);
    inventory = module.get(InventoryService);
    if (await db.showMigrations()) {
      throw new Error('Apply migrations to TEST_DATABASE_URL before testing');
    }
    const user = await db.getRepository(User).save({
      email: `checkout-${randomUUID()}@example.com`,
      passwordHash: 'unused-in-internal-service-tests',
      fullName: 'Checkout Fixture',
    });
    userId = user.id;
    const category = await db.getRepository(Category).save({
      name: 'Shirts',
      slug: `checkout-shirts-${randomUUID()}`,
    });
    categoryId = category.id;
  }, 20000);

  beforeEach(() => {
    expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  });

  afterEach(async () => {
    if (orderItemIds.length) {
      await db
        .getRepository(StockReservation)
        .delete({ orderItemId: In(orderItemIds) });
      await db.getRepository(OrderItem).delete({ id: In(orderItemIds) });
      orderItemIds.length = 0;
    }
    if (orderIds.length) {
      await db.getRepository(Order).delete({ id: In(orderIds) });
      orderIds.length = 0;
    }
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
      if (userId) {
        await db.getRepository(User).delete(userId);
      }
      if (categoryId) {
        await db.getRepository(Category).delete(categoryId);
      }
    } finally {
      await module?.close();
      jest.restoreAllMocks();
    }
  });

  async function createVariant(
    manager: EntityManager,
    {
      status = ProductStatus.PUBLISHED,
      isActive = true,
      priceMinor = 125000,
    } = {},
  ) {
    const product = await manager.getRepository(Product).save({
      categoryId,
      status,
      name: 'Cotton Shirt',
      slug: `checkout-shirt-${randomUUID()}`,
      description: 'Checkout catalog fixture',
    });
    productIds.push(product.id);
    const variant = await manager.getRepository(ProductVariant).save({
      productId: product.id,
      sku: `SHIRT-${randomUUID()}`,
      size: 'M',
      color: 'Blue',
      priceMinor,
      isActive,
    });
    variantIds.push(variant.id);
    return variant;
  }

  async function createStock(onHand: number, reserved = 0) {
    const variant = await createVariant(db.manager);
    await db.getRepository(InventoryBalance).save({
      variantId: variant.id,
      onHand,
      reserved,
    });
    return variant;
  }

  async function createOrder(
    manager: EntityManager,
    lines: { variant: ProductVariant; quantity: number }[],
  ) {
    const order = await manager.getRepository(Order).save({
      userId,
      totalMinor: lines
        .reduce((sum, { variant, quantity }) => {
          return sum + BigInt(variant.priceMinor) * BigInt(quantity);
        }, 0n)
        .toString(),
      shippingAddressSnapshot: {
        recipient: 'Checkout Fixture',
        phone: '+8801712345678',
        addressLine1: 'House 12',
        addressLine2: null,
        city: 'Dhaka',
      },
    });
    orderIds.push(order.id);
    const rows = await manager.getRepository(OrderItem).save(
      lines.map(({ variant, quantity }) => ({
        orderId: order.id,
        variantId: variant.id,
        skuSnapshot: variant.sku,
        nameSnapshot: 'Cotton Shirt',
        sizeSnapshot: variant.size,
        colorSnapshot: variant.color,
        unitPriceMinor: String(variant.priceMinor),
        quantity,
        lineTotalMinor: (
          BigInt(variant.priceMinor) * BigInt(quantity)
        ).toString(),
      })),
    );
    const items: StockReservationItem[] = rows.map(
      ({ id, variantId, quantity }) => ({
        orderItemId: id,
        variantId,
        quantity,
      }),
    );
    orderItemIds.push(...items.map(({ orderItemId }) => orderItemId));
    return { id: order.id, items };
  }

  function reserve(items: StockReservationItem[]) {
    return db.transaction((manager) =>
      inventory.reserveForOrder(manager, items, expiresAt),
    );
  }

  function balance(variant: ProductVariant) {
    return db
      .getRepository(InventoryBalance)
      .findOneByOrFail({ variantId: variant.id });
  }

  function countReservations() {
    return db
      .getRepository(StockReservation)
      .countBy({ orderItemId: In(orderItemIds) });
  }

  it('returns authoritative fields and sees catalog rows created in the supplied transaction', async () => {
    await db.transaction(async (manager) => {
      const first = await createVariant(manager, { priceMinor: 2147483647 });
      const second = await createVariant(manager);
      expect(
        await db.getRepository(ProductVariant).existsBy({ id: first.id }),
      ).toBe(false);
      const results = await catalog.getPurchasableVariants(manager, [
        second.id,
        first.id.toUpperCase(),
      ]);
      expect(results).toEqual([
        {
          variantId: second.id,
          productId: second.productId,
          productName: 'Cotton Shirt',
          productStatus: ProductStatus.PUBLISHED,
          sku: second.sku,
          size: 'M',
          color: 'Blue',
          priceMinor: '125000',
        },
        {
          variantId: first.id,
          productId: first.productId,
          productName: 'Cotton Shirt',
          productStatus: ProductStatus.PUBLISHED,
          sku: first.sku,
          size: 'M',
          color: 'Blue',
          priceMinor: '2147483647',
        },
      ]);
    });
  });

  it('preserves PostgreSQL BIGINT precision when reading a large catalog price', async () => {
    await db.transaction(async (manager) => {
      const variant = await createVariant(manager);
      // A connection-local table exercises BIGINT without altering the Cart schema.
      await manager.query(`
        CREATE TEMP TABLE product_variants ON COMMIT DROP AS
        SELECT * FROM public.product_variants WITH NO DATA
      `);
      await manager.query(
        'ALTER TABLE pg_temp.product_variants ALTER COLUMN price_minor TYPE bigint',
      );
      await manager.query(
        'INSERT INTO pg_temp.product_variants SELECT * FROM public.product_variants WHERE id = $1',
        [variant.id],
      );
      const price = '9223372036854775807';
      await manager.query(
        'UPDATE pg_temp.product_variants SET price_minor = $1 WHERE id = $2',
        [price, variant.id],
      );
      const [result] = await catalog.getPurchasableVariants(manager, [
        variant.id,
      ]);
      expect(result.priceMinor).toBe(price);
    });
  });

  it('rejects draft, archived, inactive, missing and duplicate variants', async () => {
    await db.transaction(async (manager) => {
      const active = await createVariant(manager);
      const draft = await createVariant(manager, {
        status: ProductStatus.DRAFT,
      });
      const archived = await createVariant(manager, {
        status: ProductStatus.ARCHIVED,
      });
      const inactive = await createVariant(manager, { isActive: false });
      for (const id of [draft.id, archived.id, inactive.id, randomUUID()]) {
        await expect(
          catalog.getPurchasableVariants(manager, [active.id, id]),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
      await expect(
        catalog.getPurchasableVariants(manager, [
          active.id,
          active.id.toUpperCase(),
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('reserves multiple variants and aggregates lines for the same variant', async () => {
    const first = await createStock(7, 1);
    const second = await createStock(5);
    const descending = [first, second].sort((a, b) => b.id.localeCompare(a.id));
    const { items } = await db.transaction(async (manager) => {
      const order = await createOrder(manager, [
        ...descending.map((variant) => ({ variant, quantity: 2 })),
        { variant: first, quantity: 1 },
      ]);
      await inventory.reserveForOrder(manager, order.items, expiresAt);
      return order;
    });
    expect(await balance(first)).toMatchObject({ onHand: 7, reserved: 4 });
    expect(await balance(second)).toMatchObject({ onHand: 5, reserved: 2 });
    const reservations = await db.getRepository(StockReservation).find({
      where: { orderItemId: In(items.map(({ orderItemId }) => orderItemId)) },
      relations: { orderItem: true, variant: true },
    });
    expect(reservations).toHaveLength(3);
    for (const item of items) {
      expect(
        reservations.find((r) => r.orderItemId === item.orderItemId),
      ).toMatchObject({
        ...item,
        status: StockReservationStatus.ACTIVE,
        expiresAt,
        orderItem: { id: item.orderItemId, variantId: item.variantId },
        variant: { id: item.variantId },
      });
    }
  });

  it('treats missing balances as zero and rejects stock beyond the available quantity', async () => {
    const low = await createStock(3, 2);
    const missing = await createVariant(db.manager);
    for (const variant of [low, missing]) {
      const { items } = await createOrder(db.manager, [
        { variant, quantity: 2 },
      ]);
      await expect(reserve(items)).rejects.toMatchObject({
        status: 409,
        message: 'Insufficient stock for one or more items',
      });
    }
    expect(await balance(low)).toMatchObject({ onHand: 3, reserved: 2 });
    expect(await countReservations()).toBe(0);
  });

  it('releases multiple variants and aggregates their active reservation quantities', async () => {
    const first = await createStock(7, 1);
    const second = await createStock(5);
    const order = await createOrder(db.manager, [
      { variant: first, quantity: 2 },
      { variant: second, quantity: 2 },
      { variant: first, quantity: 1 },
    ]);
    await reserve(order.items);
    await expect(
      inventory.releaseForOrder(db.manager, order.id),
    ).rejects.toThrow('active transaction');

    await db.transaction(async (manager) => {
      await module.get(OrdersService).lockForUpdate(manager, order.id);
      await inventory.releaseForOrder(manager, order.id);
    });

    expect(await balance(first)).toMatchObject({ onHand: 7, reserved: 1 });
    expect(await balance(second)).toMatchObject({ onHand: 5, reserved: 0 });
    expect(
      await db.getRepository(StockReservation).countBy({
        orderItemId: In(order.items.map(({ orderItemId }) => orderItemId)),
        status: StockReservationStatus.RELEASED,
      }),
    ).toBe(3);
  });

  it('expires all lines together when the first reservation deadline elapses', async () => {
    const first = await createStock(7, 1);
    const second = await createStock(5);
    const order = await createOrder(db.manager, [
      { variant: first, quantity: 2 },
      { variant: second, quantity: 2 },
      { variant: first, quantity: 1 },
    ]);
    await reserve(order.items);
    await db.query(
      'UPDATE stock_reservations SET expires_at = clock_timestamp() WHERE order_item_id = $1',
      [order.items[0].orderItemId],
    );

    expect(await module.get(OrderExpiryService).expireOrder(order.id)).toBe(
      true,
    );
    expect(
      await db.getRepository(Order).findOneByOrFail({ id: order.id }),
    ).toMatchObject({ status: OrderStatus.EXPIRED });
    expect(await balance(first)).toMatchObject({ onHand: 7, reserved: 1 });
    expect(await balance(second)).toMatchObject({ onHand: 5, reserved: 0 });
    expect(
      await db.getRepository(StockReservation).countBy({
        orderItemId: In(order.items.map(({ orderItemId }) => orderItemId)),
        status: StockReservationStatus.RELEASED,
      }),
    ).toBe(3);
  });

  it('rejects repeated order item IDs without partially reserving another item', async () => {
    const variant = await createStock(6);
    const { items } = await createOrder(db.manager, [{ variant, quantity: 1 }]);
    const [item] = items;
    await expect(
      reserve([item, { ...item, orderItemId: item.orderItemId.toUpperCase() }]),
    ).rejects.toBeInstanceOf(ConflictException);
    await reserve(items);
    const other = await createOrder(db.manager, [{ variant, quantity: 1 }]);
    await expect(reserve([...other.items, item])).rejects.toMatchObject({
      status: 409,
      message: 'Order item already has a reservation',
    });
    expect(await countReservations()).toBe(1);
    expect(await balance(variant)).toMatchObject({ onHand: 6, reserved: 1 });
  });

  it('rejects reservations that do not match the stored order item', async () => {
    const variant = await createStock(5);
    const other = await createStock(5);
    const {
      items: [item],
    } = await createOrder(db.manager, [{ variant, quantity: 2 }]);
    for (const invalid of [
      { ...item, orderItemId: randomUUID() },
      { ...item, variantId: other.id },
      { ...item, quantity: 1 },
    ]) {
      await expect(reserve([invalid])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(await countReservations()).toBe(0);
    expect(await balance(variant)).toMatchObject({ reserved: 0 });
    expect(await balance(other)).toMatchObject({ reserved: 0 });
  });

  it('rolls back the order and all lines when one variant has insufficient stock', async () => {
    const available = await createStock(3);
    const unavailable = await createStock(1, 1);
    await expect(
      db.transaction(async (manager) => {
        const { items } = await createOrder(manager, [
          { variant: available, quantity: 2 },
          { variant: unavailable, quantity: 1 },
        ]);
        await inventory.reserveForOrder(manager, items, expiresAt);
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await balance(available)).toMatchObject({ onHand: 3, reserved: 0 });
    expect(await balance(unavailable)).toMatchObject({
      onHand: 1,
      reserved: 1,
    });
    expect(await countReservations()).toBe(0);
    expect(await db.getRepository(Order).countBy({ id: In(orderIds) })).toBe(0);
    expect(
      await db.getRepository(OrderItem).countBy({ id: In(orderItemIds) }),
    ).toBe(0);
  });

  it('rolls back the reservation and balance changes on a later caller failure', async () => {
    const variant = await createStock(3);
    await expect(
      db.transaction(async (manager) => {
        const { items } = await createOrder(manager, [
          { variant, quantity: 2 },
        ]);
        await inventory.reserveForOrder(manager, items, expiresAt);
        expect(
          await manager.getRepository(StockReservation).countBy({
            orderItemId: items[0].orderItemId,
          }),
        ).toBe(1);
        throw new Error('Fixture failure after reservation');
      }),
    ).rejects.toThrow('Fixture failure after reservation');
    expect(await balance(variant)).toMatchObject({ onHand: 3, reserved: 0 });
    expect(await countReservations()).toBe(0);
    expect(await db.getRepository(Order).countBy({ id: In(orderIds) })).toBe(0);
    expect(
      await db.getRepository(OrderItem).countBy({ id: In(orderItemIds) }),
    ).toBe(0);
  });

  it('allows exactly one transaction to reserve the last unit', async () => {
    const variant = await createStock(1);
    const first = db.createQueryRunner();
    const second = db.createQueryRunner();
    try {
      await first.startTransaction();
      await second.startTransaction();
      const [{ pid }] = await second.manager.query<{ pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      const winner = await createOrder(first.manager, [
        { variant, quantity: 1 },
      ]);
      const competitor = await createOrder(second.manager, [
        { variant, quantity: 1 },
      ]);
      await inventory.reserveForOrder(first.manager, winner.items, expiresAt);
      const result = inventory
        .reserveForOrder(second.manager, competitor.items, expiresAt)
        .then(
          () => null,
          (error: unknown) => error,
        );
      let blocked = false;
      for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
        const [state] = await db.manager.query<{ blocked: boolean }[]>(
          'SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked',
          [pid],
        );
        blocked = state.blocked;
        if (!blocked) {
          await delay(20);
        }
      }
      await first.commitTransaction();
      expect(await result).toBeInstanceOf(ConflictException);
      expect(blocked).toBe(true);
      await second.rollbackTransaction();
      expect(await balance(variant)).toMatchObject({ onHand: 1, reserved: 1 });
      expect(await countReservations()).toBe(1);
      expect(
        await db.getRepository(Order).findBy({ id: In(orderIds) }),
      ).toMatchObject([{ id: winner.id }]);
    } finally {
      for (const runner of [first, second]) {
        if (runner.isTransactionActive) {
          await runner.rollbackTransaction();
        }
        await runner.release();
      }
    }
  });
});
