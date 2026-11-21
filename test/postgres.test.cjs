const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, before, test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { promisify } = require('node:util');
require('reflect-metadata');
require('dotenv').config();

const testDatabase = process.env.TEST_DB_NAME;
if (!testDatabase || testDatabase === process.env.DB_NAME) {
  throw new Error('Set TEST_DB_NAME to a separate, migrated PostgreSQL database.');
}
process.env.DB_NAME = testDatabase;

const { Logger } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { DataSource } = require('typeorm');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/configure-app');
const {
  Address, Cart, CartItem, Category, Collection, InventoryMovement, InventoryStock,
  Order, OrderItem, OrderStatus, Product, ProductVariant, Shipment, ShipmentStatus, User,
} = require('../dist/database/entities');
const { MovementType } = require('../dist/database/entities/inventory.entity');
const { CatalogService } = require('../dist/modules/staff/catalog.service');
const { InventoryService } = require('../dist/modules/inventory/inventory.service');
const { hashPassword } = require('../dist/modules/auth/password');
const { Role } = require('../dist/modules/auth/role');

const runId = randomUUID();
const password = 'starter-test-password';
const email = (label) => `${label}-${runId}@example.com`;
let app;
let db;
let url;
const deleteAfter = [];

async function insert(Entity, input, manager = db.manager) {
  const entity = await manager.save(Entity, manager.create(Entity, input));
  if (manager === db.manager) deleteAfter.push([Entity, entity.id]);
  return entity;
}

async function request(path, { method = 'GET', body, token, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${url}/api${path}`, {
    method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: response.status === 204 ? await response.text() : await response.json() };
}

async function createActor(label, role = Role.Customer) {
  const user = await insert(User, {
    email: email(label), name: 'Test Actor', role, passwordHash: await hashPassword(password),
  });
  const token = await app.get(JwtService).signAsync({ sub: user.id });
  return { user, token };
}

const addressInput = {
  recipientName: 'Sam Rahman', phone: '0123456789', line1: 'Test street',
  city: 'Dhaka', postalCode: '1200', countryCode: 'BD',
};

function assertError(result, status, message) {
  assert.equal(result.response.status, status);
  assert.equal(result.body.success, false);
  assert.equal(result.body.statusCode, status);
  assert.ok(result.body.requestId);
  assert.equal(result.body.requestId, result.response.headers.get('x-request-id'));
  if (message) assert.equal(result.body.message, message);
}

async function createCatalog(label) {
  const slug = `${label}-${runId}`;
  const category = await insert(Category, { slug, name: 'Shirts' });
  const product = await insert(Product, { slug, name: 'Linen shirt', categoryId: category.id });
  const variants = [];
  for (const [size, color, priceMinor] of [['M', 'black', 1250], ['L', 'blue', 2000]]) {
    variants.push(await insert(ProductVariant, {
      productId: product.id, sku: `${slug}-${size}`, size, color, priceMinor,
    }));
  }
  return { product, variants };
}

function setCartItem(variantId, quantity, token) {
  return request(`/cart/items/${variantId}`, { method: 'PUT', body: { quantity }, token });
}

function removeCartItem(variantId, token) {
  return request(`/cart/items/${variantId}`, { method: 'DELETE', token });
}

function checkout(addressId, token) {
  return request('/checkout', { method: 'POST', body: { addressId }, token });
}

async function createBuyer(label) {
  const { user, token } = await createActor(label);
  const shippingAddress = { ...addressInput, line2: 'Flat 2A' };
  const address = await insert(Address, { ...shippingAddress, userId: user.id });
  deleteAfter.push([Order, { userId: user.id }], [InventoryMovement, { actorId: user.id }]);
  return { user, token, address, shippingAddress };
}

async function waitForBlockedQuery(blockerPid, queryPattern) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    // Observe from outside the transaction so pg_stat_activity refreshes each time.
    const [blocked] = await db.query(`
      SELECT pid FROM pg_stat_activity
      WHERE $1 = ANY(pg_blocking_pids(pid)) AND query LIKE $2
    `, [blockerPid, queryPattern]);
    if (blocked) return blocked.pid;
    await delay(25);
  }
  assert.fail(`Expected a blocked PostgreSQL query matching ${queryPattern}`);
}

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  db = app.get(DataSource);
  assert.equal(await db.showMigrations(), false);
});

after(async () => {
  try {
    for (const [Entity, criteria] of deleteAfter.reverse()) {
      await db.getRepository(Entity).delete(criteria);
    }
  } finally {
    await app?.close();
  }
});

test('health and Swagger expose the runnable starter', async () => {
  const health = await request('/health');
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.body, { success: true, data: { status: 'ok' } });
  assert.ok(health.response.headers.get('x-request-id'));

  const html = await fetch(`${url}/api/docs`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Swagger UI/);
  const doc = await request('/docs-json');
  assert.ok(doc.body.paths['/api/auth/register']?.post);
  assert.deepEqual(doc.body.paths['/api/admin/access'].get.security, [{ bearer: [] }]);
});

test('HTTP logging uses final statuses and request IDs without recording input', async (t) => {
  const { token } = await createActor('request-logging');
  const log = t.mock.method(Logger.prototype, 'log', () => {});
  const health = await request('/health?secret=private-query');
  const invalid = await request('/addresses/private-path?secret=private-query', {
    method: 'PATCH', body: { line1: 'private-body' }, token,
  });
  const missing = await request('/unknown/private-path');
  assert.equal(health.response.status, 200);
  assertError(invalid, 400);
  assertError(missing, 404);

  const messages = log.mock.calls
    .filter(({ this: logger }) => logger.context === 'HTTP')
    .map(({ arguments: [message] }) => message);
  assert.equal(messages.length, 3);
  const duration = /^\d+\.\d{2}ms$/;
  for (const [result, method, path] of [
    [health, 'GET', '/api/health'],
    [invalid, 'PATCH', '/api/addresses/:id'],
    [missing, 'GET', '[unmatched]'],
  ]) {
    const requestId = result.response.headers.get('x-request-id');
    assert.ok(requestId);
    const matches = messages.filter((message) => message.endsWith(`requestId=${requestId}`));
    assert.equal(matches.length, 1);
    const [loggedMethod, loggedPath, status, elapsed, id, ...rest] = matches[0].split(' ');
    assert.deepEqual([loggedMethod, loggedPath, status], [method, path, String(result.response.status)]);
    assert.match(elapsed, duration);
    assert.equal(id, `requestId=${requestId}`);
    assert.deepEqual(rest, []);
  }
  for (const value of ['private-query', 'private-path', 'private-body', token]) {
    assert.ok(messages.every((message) => !message.includes(value)));
  }
});

test('Swagger documents customer routes, validation, and pagination', async () => {
  const { body: doc } = await request('/docs-json');
  const routes = [
    ['get', '/api/customers/me', 200],
    ['patch', '/api/customers/me', 200, 'UpdateProfileDto'],
    ['post', '/api/addresses', 201, 'CreateAddressDto'],
    ['get', '/api/addresses', 200],
    ['get', '/api/addresses/{id}', 200],
    ['patch', '/api/addresses/{id}', 200, 'UpdateAddressDto'],
    ['delete', '/api/addresses/{id}', 204],
  ];
  const schemaPath = (name) => `#/components/schemas/${name}`;
  for (const [method, path, successStatus, dto] of routes) {
    const operation = doc.paths[path][method];
    assert.ok(operation.summary);
    assert.deepEqual(operation.security, [{ bearer: [] }]);
    assert.ok(operation.responses[successStatus]);
    assert.ok(operation.responses[401]);
    assert.ok(operation.responses[403]);
    if (dto) {
      assert.equal(operation.requestBody.content['application/json'].schema.$ref, schemaPath(dto));
    }
    if (dto || path.startsWith('/api/addresses')) assert.ok(operation.responses[400]);
    if (path.endsWith('{id}')) {
      assert.ok(operation.responses[404]);
      const idParam = operation.parameters.find(({ name }) => name === 'id');
      assert.equal(idParam.schema.format, 'uuid');
      assert.equal(idParam.required, true);
    }
  }

  const list = doc.paths['/api/addresses'].get;
  assert.equal(list.parameters.length, 2);
  for (const [name, defaultValue, maximum] of [['page', 1, 100_000], ['limit', 20, 100]]) {
    const param = list.parameters.find((item) => item.name === name);
    assert.equal(param.in, 'query');
    assert.equal(param.required, false);
    assert.deepEqual(param.schema, { type: 'integer', default: defaultValue, minimum: 1, maximum });
  }
  const { properties } = list.responses[200].content['application/json'].schema;
  assert.equal(properties.data.items.$ref, schemaPath('AddressResponseDto'));
  assert.deepEqual(properties.meta.required, ['page', 'limit', 'total']);
  assert.equal(doc.paths['/api/addresses/{id}'].delete.responses[204].content, undefined);
});

test('Swagger documents all cart and order operations and their response schemas', async () => {
  const { body: doc } = await request('/docs-json');
  const operations = [
    ['get', '/api/cart', 200, 'CartResponseDto', [409]],
    ['put', '/api/cart/items/{variantId}', 200, 'CartResponseDto', [400, 404, 409]],
    ['delete', '/api/cart/items/{variantId}', 204, undefined, [400, 404]],
    ['get', '/api/orders', 200, 'OrderSummaryDto', [400]],
    ['get', '/api/orders/{id}', 200, 'OrderDetailDto', [400, 404]],
  ];
  const schemaPath = (name) => `#/components/schemas/${name}`;
  for (const [method, path, status, dto, errors] of operations) {
    const operation = doc.paths[path][method];
    assert.ok(operation.summary);
    assert.deepEqual(operation.security, [{ bearer: [] }]);
    for (const error of [401, 403, ...errors]) assert.ok(operation.responses[error]);

    const { content } = operation.responses[status];
    if (status === 204) {
      assert.equal(content, undefined);
    } else {
      const { data, meta } = content['application/json'].schema.properties;
      if (path === '/api/orders') {
        assert.equal(data.items.$ref, schemaPath(dto));
        assert.deepEqual(meta.required, ['page', 'limit', 'total']);
      } else {
        assert.equal(data.$ref, schemaPath(dto));
      }
    }
    if (path.endsWith('}')) {
      const [param] = operation.parameters;
      assert.equal(param.name, path.match(/\{(\w+)\}$/)[1]);
      assert.equal(param.in, 'path');
      assert.equal(param.required, true);
      assert.deepEqual(param.schema, { type: 'string', format: 'uuid' });
    }
  }

  const put = doc.paths['/api/cart/items/{variantId}'].put;
  assert.equal(put.requestBody.content['application/json'].schema.$ref, schemaPath('SetCartItemDto'));
  const schemas = doc.components.schemas;
  assert.deepEqual(schemas.SetCartItemDto.required, ['quantity']);
  assert.deepEqual(schemas.SetCartItemDto.properties.quantity, {
    type: 'integer', minimum: 1, maximum: 1000,
  });
  assert.equal(schemas.CartResponseDto.properties.id.nullable, true);
  assert.equal(schemas.CartResponseDto.properties.items.items.$ref, schemaPath('CartItemResponseDto'));
  assert.equal(schemas.OrderDetailDto.properties.items.items.$ref, schemaPath('OrderItemResponseDto'));
  assert.equal(schemas.OrderDetailDto.properties.shippingAddress.$ref, schemaPath('OrderShippingAddressDto'));

  const params = doc.paths['/api/orders'].get.parameters;
  assert.equal(params.length, 2);
  for (const [name, defaultValue, maximum] of [['page', 1, 100_000], ['limit', 20, 100]]) {
    const param = params.find((item) => item.name === name);
    assert.equal(param.in, 'query');
    assert.equal(param.required, false);
    assert.deepEqual(param.schema, { type: 'integer', default: defaultValue, minimum: 1, maximum });
  }
});

test('Swagger documents checkout input, order response, and errors', async () => {
  const { body: doc } = await request('/docs-json');
  const operation = doc.paths['/api/checkout'].post;
  assert.match(operation.summary, /cash-on-delivery/);
  assert.deepEqual(operation.security, [{ bearer: [] }]);
  assert.equal(operation.requestBody.content['application/json'].schema.$ref, '#/components/schemas/CheckoutDto');
  const checkoutSchema = doc.components.schemas.CheckoutDto;
  assert.deepEqual(checkoutSchema.required, ['addressId']);
  assert.deepEqual(checkoutSchema.properties.addressId, { type: 'string', format: 'uuid' });
  const created = operation.responses[201].content['application/json'].schema;
  assert.deepEqual(created.required, ['success', 'data']);
  assert.equal(created.properties.data.$ref, '#/components/schemas/OrderDetailDto');
  assert.deepEqual(operation.responses[201].headers['X-Response-Time'].schema, {
    type: 'string', example: '12.34ms',
  });
  for (const status of [400, 401, 403, 404, 409]) assert.ok(operation.responses[status]);
});

test('registration, login, authorization, and account deactivation', async () => {
  const signup = { email: email('customer'), password, name: 'Test Customer' };
  const invalid = await request('/auth/register', {
    method: 'POST', body: { ...signup, role: Role.Admin },
  });
  assert.equal(invalid.response.status, 400);
  assert.ok(invalid.body.message.includes('property role should not exist'));
  assert.equal(invalid.body.requestId, invalid.response.headers.get('x-request-id'));

  const registered = await request('/auth/register', { method: 'POST', body: signup });
  assert.equal(registered.response.status, 201);
  const { user, accessToken } = registered.body.data;
  deleteAfter.push([User, user.id]);
  assert.equal(user.role, Role.Customer);
  assert.equal(user.passwordHash, undefined);

  const duplicate = await request('/auth/register', {
    method: 'POST', body: { ...signup, email: signup.email.toUpperCase() },
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.success, false);
  assert.equal(duplicate.body.message, 'A record with that value already exists');

  const wrong = await request('/auth/login', {
    method: 'POST', body: { email: signup.email, password: 'incorrect-password' },
  });
  assert.equal(wrong.response.status, 401);

  const noToken = await request('/auth/me');
  assert.equal(noToken.response.status, 401);
  assert.equal(noToken.body.success, false);
  assert.equal((await request('/auth/me', { token: 'bad.token.value' })).response.status, 401);
  assert.deepEqual((await request('/auth/me', { token: accessToken })).body.data, user);

  const forbidden = await request('/admin/access', { token: accessToken });
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.body.statusCode, 403);

  const admin = await insert(User, {
    email: email('admin'), name: 'Test Admin', role: Role.Admin,
    passwordHash: await hashPassword(password),
  });
  const login = await request('/auth/login', { method: 'POST', body: { email: admin.email, password } });
  assert.equal(login.response.status, 200);
  const adminToken = login.body.data.accessToken;
  assert.equal((await request('/admin/access', { token: adminToken })).body.data.role, Role.Admin);

  await db.getRepository(User).update(admin.id, { isActive: false });
  assert.equal((await request('/admin/access', { token: adminToken })).response.status, 401);
  const missing = await request('/unused-route');
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.success, false);
});

test('customers can read their own public profile and update only their name', async () => {
  const { user, token } = await createActor('profile');
  const expected = { id: user.id, email: user.email, name: user.name, role: Role.Customer };
  const initial = await request('/customers/me', { token });
  assert.equal(initial.response.status, 200);
  assert.deepEqual(initial.body, { success: true, data: expected });

  const updated = await request('/customers/me', {
    method: 'PATCH', token, body: { name: ' Sam Rahman ' },
  });
  const renamed = { ...expected, name: 'Sam Rahman' };
  assert.equal(updated.response.status, 200);
  assert.deepEqual(updated.body, { success: true, data: renamed });

  const invalidProfiles = [
    {}, { name: ' ' }, { name: null }, { name: 'Sam\0' }, { name: 'Sam', email: 'other@example.com' },
  ];
  for (const body of invalidProfiles) {
    assertError(await request('/customers/me', { method: 'PATCH', token, body }), 400);
  }
  assert.deepEqual((await request('/customers/me', { token })).body.data, renamed);
  assert.equal((await db.getRepository(User).findOneByOrFail({ id: user.id })).name, 'Sam Rahman');
});

test('every customer route requires a JWT and the Customer role', async () => {
  const { token } = await createActor('customer-routes-admin', Role.Admin);
  const addressPath = `/addresses/${randomUUID()}`;
  const cartItemPath = `/cart/items/${randomUUID()}`;
  const routes = [
    ['GET', '/customers/me'],
    ['PATCH', '/customers/me', { name: 'New name' }],
    ['GET', '/addresses'],
    ['POST', '/addresses', addressInput],
    ['GET', addressPath],
    ['PATCH', addressPath, { city: 'Rajshahi' }],
    ['DELETE', addressPath],
    ['GET', '/cart'],
    ['PUT', cartItemPath, { quantity: 2 }],
    ['DELETE', cartItemPath],
    ['GET', '/orders'],
    ['GET', `/orders/${randomUUID()}`],
    ['POST', '/checkout', { addressId: randomUUID() }],
  ];
  for (const [method, path, body] of routes) {
    assertError(await request(path, { method, body }), 401);
    assertError(await request(path, { method, body, token }), 403);
  }
});

test('customers can create, retrieve, update, and delete an owned address', async () => {
  const { user, token } = await createActor('address-crud');
  const created = await request('/addresses', { method: 'POST', body: addressInput, token });
  assert.equal(created.response.status, 201);
  const { id, createdAt, updatedAt } = created.body.data;
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Date(createdAt).toISOString(), createdAt);
  assert.equal(new Date(updatedAt).toISOString(), updatedAt);
  assert.deepEqual(created.body, {
    success: true, data: { ...addressInput, id, line2: null, createdAt, updatedAt },
  });
  const addressPath = `/addresses/${id}`;
  const repo = db.getRepository(Address);
  assert.equal((await repo.findOneByOrFail({ id })).userId, user.id);
  const fetched = await request(addressPath, { token });
  assert.equal(fetched.response.status, 200);
  assert.deepEqual(fetched.body, created.body);

  const changes = { city: 'Rajshahi', line2: 'Flat 2A' };
  const updated = await request(addressPath, { method: 'PATCH', body: changes, token });
  assert.equal(updated.response.status, 200);
  assert.deepEqual(updated.body, {
    success: true, data: { ...created.body.data, ...changes, updatedAt: updated.body.data.updatedAt },
  });
  const cleared = await request(addressPath, { method: 'PATCH', body: { line2: null }, token });
  assert.equal(cleared.response.status, 200);
  assert.equal(cleared.body.data.line2, null);
  const stored = await repo.findOneByOrFail({ id, userId: user.id });
  assert.equal(stored.line2, null);
  assert.equal(stored.city, changes.city);
  const noChange = await request(addressPath, { method: 'PATCH', body: {}, token });
  assert.equal(noChange.response.status, 200);
  assert.deepEqual(noChange.body, cleared.body);

  const deleted = await request(addressPath, { method: 'DELETE', token });
  assert.equal(deleted.response.status, 204);
  assert.equal(deleted.body, '');
  assert.equal(await repo.countBy({ id }), 0);
  assertError(await request(addressPath, { token }), 404, 'Address not found');
  assertError(await request(addressPath, { method: 'DELETE', token }), 404, 'Address not found');
});

test('address pagination counts only owned rows and sorts by creation time and ID', async () => {
  const { user, token } = await createActor('address-list');
  const { user: other } = await createActor('address-list-other');
  const createdAt = new Date('2026-01-02T00:00:00Z');
  const [thirdId, firstId, secondId] = [randomUUID(), randomUUID(), randomUUID()].sort();
  const rows = [
    { id: secondId, createdAt },
    { id: firstId, createdAt },
    { id: thirdId, createdAt: new Date('2026-01-01T00:00:00Z') },
  ];
  for (const row of rows) {
    await insert(Address, { ...addressInput, ...row, userId: user.id });
  }
  await insert(Address, { ...addressInput, userId: other.id });

  const defaults = await request('/addresses', { token });
  assert.equal(defaults.response.status, 200);
  assert.equal(defaults.body.success, true);
  assert.deepEqual(defaults.body.meta, { page: 1, limit: 20, total: 3 });
  assert.deepEqual(defaults.body.data.map(({ id }) => id), [firstId, secondId, thirdId]);

  const second = await request('/addresses?page=2&limit=1', { token });
  assert.equal(second.response.status, 200);
  assert.deepEqual(second.body.meta, { page: 2, limit: 1, total: 3 });
  assert.deepEqual(second.body.data.map(({ id }) => id), [secondId]);

  const beyond = await request('/addresses?page=4&limit=1', { token });
  assert.equal(beyond.response.status, 200);
  assert.deepEqual(beyond.body, { success: true, data: [], meta: { page: 4, limit: 1, total: 3 } });
});

test('address routes reject invalid DTO fields, pagination, and UUIDs', async () => {
  const { user, token } = await createActor('address-validation');
  const { id } = await insert(Address, { ...addressInput, userId: user.id });
  const createBodies = [
    {},
    { ...addressInput, countryCode: 'bd' },
    { ...addressInput, line1: 'A\0B' },
    { ...addressInput, userId: randomUUID() },
  ];
  for (const body of createBodies) {
    assertError(await request('/addresses', { method: 'POST', body, token }), 400);
  }
  for (const body of [{ city: null }, { phone: 123 }, { line2: 'A\0B' }, { userId: randomUUID() }]) {
    assertError(await request(`/addresses/${id}`, { method: 'PATCH', body, token }), 400);
  }
  for (const query of ['page=0', 'page=1.5', 'limit=101', 'limit=1&limit=2', 'owner=other']) {
    assertError(await request(`/addresses?${query}`, { token }), 400);
  }
  for (const invalidId of ['invalid', '123e4567-e89b-12d3-a456-426614174000']) {
    const path = `/addresses/${invalidId}`;
    assertError(await request(path, { token }), 400);
    assertError(await request(path, { method: 'PATCH', body: { city: 'Rajshahi' }, token }), 400);
    assertError(await request(path, { method: 'DELETE', token }), 400);
  }
  const repo = db.getRepository(Address);
  assert.equal(await repo.countBy({ userId: user.id }), 1);
  assert.equal((await repo.findOneByOrFail({ id })).city, addressInput.city);
});

test('missing and unowned address IDs return the same 404 for reads and writes', async () => {
  const { user, token } = await createActor('address-owner');
  const { token: otherToken } = await createActor('address-non-owner');
  const { id } = await insert(Address, { ...addressInput, userId: user.id });
  const missing = randomUUID();
  for (const blocked of [id, missing]) {
    const path = `/addresses/${blocked}`;
    const options = { token: otherToken };
    assertError(await request(path, options), 404, 'Address not found');
    assertError(await request(path, {
      ...options, method: 'PATCH', body: { city: 'Rajshahi' },
    }), 404, 'Address not found');
    assertError(await request(path, { ...options, method: 'DELETE' }), 404, 'Address not found');
  }
  const owned = await request(`/addresses/${id}`, { token });
  assert.equal(owned.response.status, 200);
  assert.equal(owned.body.data.city, addressInput.city);
});

test('cart starts empty, sets absolute quantities, and totals current prices without affecting stock', async () => {
  const { product, variants: [first, second] } = await createCatalog('cart-crud');
  const { user, token } = await createActor('cart-crud');
  await insert(InventoryStock, { variantId: first.id, quantity: 1 });

  const empty = await request('/cart', { token });
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body, { success: true, data: { id: null, items: [], totalMinor: 0 } });
  const carts = db.getRepository(Cart);
  assert.equal(await carts.countBy({ userId: user.id }), 0);

  const item = {
    variantId: first.id, sku: first.sku, productName: product.name, size: first.size, color: first.color,
    quantity: 2, unitPriceMinor: first.priceMinor, available: true,
  };
  const created = await setCartItem(first.id, 2, token);
  assert.equal(created.response.status, 200);
  const { id } = await carts.findOneByOrFail({ userId: user.id });
  assert.deepEqual(created.body, { success: true, data: { id, items: [item], totalMinor: 2500 } });

  const updated = await setCartItem(first.id, 3, token);
  assert.equal(updated.response.status, 200);
  assert.deepEqual(updated.body.data, { id, items: [{ ...item, quantity: 3 }], totalMinor: 3750 });
  const repeated = await setCartItem(first.id, 3, token);
  assert.equal(repeated.response.status, 200);
  assert.deepEqual(repeated.body, updated.body);

  const added = await setCartItem(second.id, 1, token);
  assert.equal(added.response.status, 200);
  assert.equal(added.body.data.totalMinor, 5750);
  assert.deepEqual(added.body.data.items.map(({ variantId }) => variantId), [first.id, second.id].sort());
  assert.equal(await db.getRepository(CartItem).countBy({ cartId: id }), 2);

  await db.getRepository(ProductVariant).update(first.id, { priceMinor: 1500 });
  const reread = await request('/cart', { token });
  assert.equal(reread.response.status, 200);
  assert.equal(reread.body.data.totalMinor, 6500);
  assert.equal(reread.body.data.items.find(({ variantId }) => variantId === first.id).unitPriceMinor, 1500);

  const removed = await removeCartItem(first.id, token);
  assert.equal(removed.response.status, 204);
  assert.equal(removed.body, '');
  assertError(await removeCartItem(first.id, token), 404, 'Cart item not found');
  const remaining = await request('/cart', { token });
  assert.equal(remaining.body.data.totalMinor, 2000);
  assert.deepEqual(remaining.body.data.items.map(({ variantId }) => variantId), [second.id]);
  assert.equal((await db.getRepository(InventoryStock).findOneByOrFail({ variantId: first.id })).quantity, 1);
  assert.equal(await db.getRepository(InventoryStock).countBy({ variantId: second.id }), 0);
  assert.equal(await db.getRepository(InventoryMovement).countBy({ actorId: user.id }), 0);
});

test('cart rejects invalid input and displays inactive items so they can be removed', async () => {
  const { product, variants: [first, second] } = await createCatalog('cart-validation');
  const { user, token } = await createActor('cart-validation');
  for (const quantity of [0, -1, 1.5, '2', 1001, null, undefined]) {
    assertError(await setCartItem(first.id, quantity, token), 400);
  }
  for (const invalidId of ['invalid', '123e4567-e89b-12d3-a456-426614174000']) {
    assertError(await setCartItem(invalidId, 1, token), 400);
    assertError(await removeCartItem(invalidId, token), 400);
  }
  assertError(await setCartItem(randomUUID(), 1, token), 404, 'Variant not found');

  const variants = db.getRepository(ProductVariant);
  const products = db.getRepository(Product);
  await variants.update(first.id, { isActive: false });
  assertError(await setCartItem(first.id, 1, token), 409, 'Variant is unavailable');
  await products.update(product.id, { isActive: false });
  assertError(await setCartItem(second.id, 1, token), 409, 'Variant is unavailable');
  assert.equal(await db.getRepository(Cart).countBy({ userId: user.id }), 0);

  await products.update(product.id, { isActive: true });
  await variants.update(first.id, { isActive: true });
  assert.equal((await setCartItem(first.id, 1000, token)).response.status, 200);
  assert.equal((await setCartItem(second.id, 2, token)).response.status, 200);
  await variants.update(first.id, { isActive: false });
  assertError(await setCartItem(first.id, 1, token), 409, 'Variant is unavailable');
  const partial = await request('/cart', { token });
  assert.equal(partial.response.status, 200);
  assert.equal(partial.body.data.totalMinor, 4000);
  const inactiveItem = partial.body.data.items.find(({ variantId }) => variantId === first.id);
  assert.equal(inactiveItem.available, false);
  assert.equal(inactiveItem.quantity, 1000);
  assert.equal(inactiveItem.unitPriceMinor, first.priceMinor);
  assert.equal((await removeCartItem(first.id, token)).response.status, 204);

  await products.update(product.id, { isActive: false });
  assertError(await setCartItem(second.id, 1, token), 409, 'Variant is unavailable');
  const unavailable = await request('/cart', { token });
  assert.equal(unavailable.response.status, 200);
  assert.equal(unavailable.body.data.totalMinor, 0);
  assert.equal(unavailable.body.data.items[0].available, false);
  assert.equal((await removeCartItem(second.id, token)).response.status, 204);
});

test('cart reads, writes, and deletes are isolated by customer', async () => {
  const { variants: [variant] } = await createCatalog('cart-isolation');
  const { token: ownerToken } = await createActor('cart-owner');
  const { token: otherToken } = await createActor('cart-other');
  const ownerCart = await setCartItem(variant.id, 2, ownerToken);
  assert.equal(ownerCart.response.status, 200);
  assert.equal((await request('/cart', { token: otherToken })).body.data.id, null);
  assertError(await removeCartItem(variant.id, otherToken), 404, 'Cart item not found');

  const otherCart = await setCartItem(variant.id, 5, otherToken);
  assert.equal(otherCart.response.status, 200);
  assert.notEqual(otherCart.body.data.id, ownerCart.body.data.id);
  assert.equal(otherCart.body.data.items[0].quantity, 5);
  assert.deepEqual((await request('/cart', { token: ownerToken })).body, ownerCart.body);
  assert.equal((await removeCartItem(variant.id, otherToken)).response.status, 204);
  assert.deepEqual((await request('/cart', { token: ownerToken })).body, ownerCart.body);
});

test('concurrent PUTs create one cart and one row per variant', async () => {
  const { variants: [first, second] } = await createCatalog('cart-concurrency');
  const { user, token } = await createActor('cart-concurrency');
  const requests = [[first.id, 2], [first.id, 7], [second.id, 3]];
  const results = await Promise.all(requests.map(([variantId, quantity]) =>
    setCartItem(variantId, quantity, token)));
  const carts = await db.getRepository(Cart).findBy({ userId: user.id });
  assert.equal(carts.length, 1);
  const [{ id }] = carts;
  for (const [index, result] of results.entries()) {
    const [variantId, quantity] = requests[index];
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.id, id);
    assert.equal(result.body.data.items.find((item) => item.variantId === variantId).quantity, quantity);
  }

  const stored = await db.getRepository(CartItem).findBy({ cartId: id });
  assert.equal(stored.length, 2);
  assert.ok([2, 7].includes(stored.find(({ variantId }) => variantId === first.id).quantity));
  assert.equal(stored.find(({ variantId }) => variantId === second.id).quantity, 3);
});

test('PUT and DELETE wait behind a checkout-style cart row lock', async () => {
  const { variants: [variant] } = await createCatalog('cart-lock');
  const { user, token } = await createActor('cart-lock');
  assert.equal((await setCartItem(variant.id, 1, token)).response.status, 200);

  for (const [mutate, status] of [
    [() => setCartItem(variant.id, 2, token), 200],
    [() => removeCartItem(variant.id, token), 204],
  ]) {
    let pending;
    try {
      await db.transaction(async (manager) => {
        await manager.getRepository(Cart).findOneOrFail({
          where: { userId: user.id }, lock: { mode: 'pessimistic_write' },
        });
        const [{ pid }] = await manager.query('SELECT pg_backend_pid() AS pid');
        pending = mutate();
        await waitForBlockedQuery(pid, '%FOR UPDATE%');
      });
    } finally {
      if (pending) assert.equal((await pending).response.status, status);
    }
  }
  assert.deepEqual((await request('/cart', { token })).body.data.items, []);
});

test('order history paginates only owned orders and uses descending creation time then ID', async () => {
  const { user, token } = await createActor('order-history');
  const { user: other } = await createActor('order-history-other');
  const empty = await request('/orders', { token });
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body, { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } });

  const [lowId, middleId, highId] = [randomUUID(), randomUUID(), randomUUID()].sort();
  const latest = new Date('2026-01-02T00:00:00Z');
  const older = new Date('2026-01-01T00:00:00Z');
  const rows = [
    { id: lowId, createdAt: latest, totalMinor: 100 },
    { id: middleId, createdAt: latest, totalMinor: 200 },
    { id: highId, createdAt: older, totalMinor: 300 },
  ];
  const shippingAddress = { ...addressInput, line2: null };
  for (const row of rows) await insert(Order, { ...row, shippingAddress, userId: user.id });
  await insert(Order, { shippingAddress, userId: other.id, totalMinor: 400 });

  const expected = [rows[1], rows[0], rows[2]].map((row) => ({
    ...row, createdAt: row.createdAt.toISOString(),
  }));
  const full = await request('/orders', { token });
  assert.equal(full.response.status, 200);
  assert.deepEqual(full.body, { success: true, data: expected, meta: { page: 1, limit: 20, total: 3 } });

  const second = await request('/orders?page=2&limit=2', { token });
  assert.equal(second.response.status, 200);
  assert.deepEqual(second.body, {
    success: true, data: expected.slice(2), meta: { page: 2, limit: 2, total: 3 },
  });
  const beyond = await request('/orders?page=3&limit=2', { token });
  assert.equal(beyond.response.status, 200);
  assert.deepEqual(beyond.body, { success: true, data: [], meta: { page: 3, limit: 2, total: 3 } });
  assertError(await request('/orders?limit=101', { token }), 400);
});

test('order detail uses owned shipping and item snapshots even after catalog and address edits', async () => {
  const { product, variants: [first, second] } = await createCatalog('order-detail');
  const { user, token } = await createActor('order-detail');
  const { token: otherToken } = await createActor('order-detail-other');
  const shippingAddress = { ...addressInput, line2: null };
  const address = await insert(Address, { ...shippingAddress, userId: user.id });
  const order = await insert(Order, { shippingAddress, userId: user.id, totalMinor: 2650 });
  const snapshots = [
    {
      variantId: first.id, sku: first.sku, productName: product.name, size: first.size, color: first.color,
      quantity: 2, unitPriceMinor: 825,
    },
    {
      variantId: second.id, sku: second.sku, productName: product.name, size: second.size, color: second.color,
      quantity: 1, unitPriceMinor: 1000,
    },
  ];
  const items = [];
  for (const snapshot of snapshots) {
    const item = await insert(OrderItem, { ...snapshot, orderId: order.id });
    items.push({ ...snapshot, id: item.id });
  }
  items.sort((left, right) => left.id.localeCompare(right.id));

  await db.getRepository(Address).update(address.id, { city: 'Chattogram' });
  await db.getRepository(Product).update(product.id, { name: 'New catalog name', isActive: false });
  await db.getRepository(ProductVariant).update(first.id, { priceMinor: 5000, color: 'white' });

  const path = `/orders/${order.id}`;
  const detail = await request(path, { token });
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.body, {
    success: true,
    data: { id: order.id, createdAt: order.createdAt.toISOString(), totalMinor: 2650, shippingAddress, items },
  });
  assertError(await request(path, { token: otherToken }), 404, 'Order not found');
  assertError(await request(`/orders/${randomUUID()}`, { token }), 404, 'Order not found');
  for (const invalidId of ['invalid', '123e4567-e89b-12d3-a456-426614174000']) {
    assertError(await request(`/orders/${invalidId}`, { token }), 400);
  }
});

test('checkout places a cash-on-delivery order at current prices and preserves snapshots', async () => {
  const { product, variants: [first, second] } = await createCatalog('checkout-success');
  const { user, token, address, shippingAddress } = await createBuyer('checkout-success');
  const firstStock = await insert(InventoryStock, { variantId: first.id, quantity: 5 });
  const secondStock = await insert(InventoryStock, { variantId: second.id, quantity: 3 });
  assert.equal((await setCartItem(first.id, 2, token)).response.status, 200);
  const cart = await setCartItem(second.id, 1, token);
  assert.equal(cart.response.status, 200);
  assert.equal(cart.body.data.totalMinor, 4500);
  await db.getRepository(ProductVariant).update(first.id, { priceMinor: 1700 });

  const placed = await checkout(address.id, token);
  assert.equal(placed.response.status, 201);
  assert.match(placed.response.headers.get('x-response-time'), /^\d+\.\d{2}ms$/);
  const { id, createdAt, items } = placed.body.data;
  const snapshots = [
    { ...first, quantity: 2, priceMinor: 1700 }, { ...second, quantity: 1 },
  ].map(({ id: variantId, sku, size, color, quantity, priceMinor }) => ({
    id: items.find((item) => item.variantId === variantId).id,
    variantId, sku, size, color, quantity, unitPriceMinor: priceMinor, productName: product.name,
  })).sort((left, right) => left.id.localeCompare(right.id));
  const summary = { id, createdAt, totalMinor: 5400 };
  assert.deepEqual(placed.body, {
    success: true, data: { ...summary, shippingAddress, items: snapshots },
  });

  const orders = db.getRepository(Order);
  const stored = await orders.findOneOrFail({ where: { id }, relations: { items: true } });
  assert.equal(await orders.countBy({ userId: user.id }), 1);
  assert.equal(stored.userId, user.id);
  assert.equal(stored.totalMinor, summary.totalMinor);
  assert.equal(stored.createdAt.toISOString(), createdAt);
  assert.deepEqual(stored.shippingAddress, shippingAddress);
  const storedItems = stored.items.map(({ orderId, createdAt: _created, updatedAt: _updated, ...item }) => {
    assert.equal(orderId, id);
    return item;
  }).sort((left, right) => left.id.localeCompare(right.id));
  assert.deepEqual(storedItems, snapshots);

  const stock = db.getRepository(InventoryStock);
  assert.equal((await stock.findOneByOrFail({ id: firstStock.id })).quantity, 3);
  assert.equal((await stock.findOneByOrFail({ id: secondStock.id })).quantity, 2);
  const movements = await db.getRepository(InventoryMovement).find({ where: { actorId: user.id } });
  const actualSales = movements.map(({ variantId, type, delta, reason }) => ({ variantId, type, delta, reason }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId));
  const expectedSales = snapshots.map(({ variantId, quantity }) => ({
    variantId, type: MovementType.Sale, delta: -quantity, reason: `Order ${id}`,
  })).sort((a, b) => a.variantId.localeCompare(b.variantId));
  assert.deepEqual(actualSales, expectedSales);
  assert.equal(await db.getRepository(CartItem).countBy({ cartId: cart.body.data.id }), 0);

  await db.getRepository(Address).update(address.id, { city: 'Chattogram' });
  await db.getRepository(Product).update(product.id, { name: 'Renamed product' });
  await db.getRepository(ProductVariant).update(first.id, { priceMinor: 5000, color: 'green' });
  const history = await request('/orders', { token });
  assert.equal(history.response.status, 200);
  assert.equal(history.response.headers.get('x-response-time'), null);
  assert.deepEqual(history.body, { success: true, data: [summary], meta: { page: 1, limit: 20, total: 1 } });
  const detail = await request(`/orders/${id}`, { token });
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.body, placed.body);
});

test('checkout validates the body, requires a nonempty cart, and only accepts owned addresses', async () => {
  const { variants: [variant] } = await createCatalog('checkout-validation');
  const { user, token, address } = await createBuyer('checkout-validation');
  const { address: otherAddress } = await createBuyer('checkout-address-owner');
  for (const body of [
    {}, { addressId: 'invalid' }, { addressId: '123e4567-e89b-12d3-a456-426614174000' },
    { addressId: address.id, totalMinor: 0 },
  ]) {
    assertError(await request('/checkout', { method: 'POST', body, token }), 400);
  }
  const denied = await checkout(address.id);
  assertError(denied, 401);
  assert.equal(denied.response.headers.get('x-response-time'), null);
  const empty = await checkout(address.id, token);
  assertError(empty, 400, 'Cart is empty');
  assert.match(empty.response.headers.get('x-response-time'), /^\d+\.\d{2}ms$/);
  const carts = db.getRepository(Cart);
  assert.equal(await carts.countBy({ userId: user.id }), 0);
  const cart = await setCartItem(variant.id, 2, token);
  assert.equal(cart.response.status, 200);
  assertError(await checkout(otherAddress.id, token), 404, 'Address not found');
  assertError(await checkout(randomUUID(), token), 404, 'Address not found');
  assert.equal(await db.getRepository(CartItem).countBy({ cartId: cart.body.data.id }), 1);
  assert.equal((await removeCartItem(variant.id, token)).response.status, 204);
  assertError(await checkout(address.id, token), 400, 'Cart is empty');
  assert.equal(await db.getRepository(Order).countBy({ userId: user.id }), 0);
});

test('checkout rejects inactive variants, inactive products, and missing stock', async () => {
  const { product, variants: [variant] } = await createCatalog('checkout-unavailable');
  const { user, token, address } = await createBuyer('checkout-unavailable');
  const cart = await setCartItem(variant.id, 1, token);
  assert.equal(cart.response.status, 200);

  const variants = db.getRepository(ProductVariant);
  const products = db.getRepository(Product);
  await variants.update(variant.id, { isActive: false });
  assertError(await checkout(address.id, token), 409, 'Cart contains an unavailable variant');
  await variants.update(variant.id, { isActive: true });
  await products.update(product.id, { isActive: false });
  assertError(await checkout(address.id, token), 409, 'Cart contains an unavailable variant');
  await products.update(product.id, { isActive: true });
  assertError(await checkout(address.id, token), 409, 'Insufficient stock');
  assert.equal(await db.getRepository(Order).countBy({ userId: user.id }), 0);
  assert.equal(await db.getRepository(InventoryMovement).countBy({ actorId: user.id }), 0);
  assert.equal(await db.getRepository(CartItem).countBy({ cartId: cart.body.data.id }), 1);
});

test('checkout rejects line and order overflow and accepts the PostgreSQL integer maximum', async () => {
  const { variants: [first, second] } = await createCatalog('checkout-overflow');
  const { user, token, address } = await createBuyer('checkout-overflow');
  const variants = db.getRepository(ProductVariant);
  const maximum = 2_147_483_647;
  await variants.update(first.id, { priceMinor: maximum });
  const stock = await insert(InventoryStock, { variantId: first.id, quantity: 2 });
  await insert(InventoryStock, { variantId: second.id, quantity: 2 });

  assert.equal((await setCartItem(first.id, 2, token)).response.status, 200);
  assertError(await checkout(address.id, token), 400, 'Order total exceeds the supported range');
  assert.equal((await setCartItem(first.id, 1, token)).response.status, 200);
  assert.equal((await setCartItem(second.id, 1, token)).response.status, 200);
  assertError(await checkout(address.id, token), 400, 'Order total exceeds the supported range');
  assert.equal(await db.getRepository(Order).countBy({ userId: user.id }), 0);
  assert.equal((await db.getRepository(InventoryStock).findOneByOrFail({ id: stock.id })).quantity, 2);
  assert.equal(await db.getRepository(InventoryMovement).countBy({ actorId: user.id }), 0);
  assert.equal((await request('/cart', { token })).body.data.items.length, 2);

  assert.equal((await removeCartItem(second.id, token)).response.status, 204);
  const placed = await checkout(address.id, token);
  assert.equal(placed.response.status, 201);
  assert.equal(placed.body.data.totalMinor, maximum);
});

test('checkout rolls back the order, items, stock, and movements when a later deduction fails', async (t) => {
  const { variants } = await createCatalog('checkout-rollback');
  const [first, second] = variants.sort((left, right) => left.id.localeCompare(right.id));
  const { user, token, address } = await createBuyer('checkout-rollback');
  const firstStock = await insert(InventoryStock, { variantId: first.id, quantity: 5 });
  const secondStock = await insert(InventoryStock, { variantId: second.id, quantity: 1 });
  assert.equal((await setCartItem(second.id, 2, token)).response.status, 200);
  const cart = await setCartItem(first.id, 2, token);
  assert.equal(cart.response.status, 200);
  const cartItems = db.getRepository(CartItem);
  const cartQuery = { where: { cartId: cart.body.data.id }, order: { variantId: 'ASC' } };
  const beforeItems = await cartItems.find(cartQuery);

  const inventory = app.get(InventoryService);
  const deductStock = inventory.deductStock.bind(inventory);
  let attemptedOrderId;
  const observed = t.mock.method(inventory, 'deductStock', async (manager, variantId, quantity, actorId, orderId) => {
    attemptedOrderId = orderId;
    if (variantId === second.id) {
      assert.equal(await manager.countBy(Order, { id: orderId }), 1);
      assert.equal(await manager.countBy(OrderItem, { orderId }), 2);
      assert.equal((await manager.findOneByOrFail(InventoryStock, { id: firstStock.id })).quantity, 3);
      assert.equal(await manager.countBy(InventoryMovement, { variantId: first.id, actorId }), 1);
    }
    return deductStock(manager, variantId, quantity, actorId, orderId);
  });

  assertError(await checkout(address.id, token), 409, 'Insufficient stock');
  assert.deepEqual(observed.mock.calls.map(({ arguments: args }) => args[1]), [first.id, second.id]);
  assert.ok(attemptedOrderId);
  assert.equal(await db.getRepository(Order).countBy({ userId: user.id }), 0);
  assert.equal(await db.getRepository(OrderItem).countBy({ orderId: attemptedOrderId }), 0);
  assert.equal(await db.getRepository(InventoryMovement).countBy({ actorId: user.id }), 0);
  const stocks = db.getRepository(InventoryStock);
  assert.equal((await stocks.findOneByOrFail({ id: firstStock.id })).quantity, 5);
  assert.equal((await stocks.findOneByOrFail({ id: secondStock.id })).quantity, 1);
  assert.deepEqual(await cartItems.find(cartQuery), beforeItems);
});

test('concurrent checkouts for the last unit produce one order and one deduction', async () => {
  const { variants: [variant] } = await createCatalog('checkout-contention');
  const buyers = [await createBuyer('checkout-race-first'), await createBuyer('checkout-race-second')];
  await insert(InventoryStock, { variantId: variant.id, quantity: 1 });
  for (const buyer of buyers) {
    assert.equal((await setCartItem(variant.id, 1, buyer.token)).response.status, 200);
  }
  const results = await Promise.all(buyers.map(({ address, token }) => checkout(address.id, token)));
  assert.deepEqual(results.map(({ response }) => response.status).sort(), [201, 409]);
  const winnerIndex = results.findIndex(({ response }) => response.status === 201);
  const winner = buyers[winnerIndex];
  const loser = buyers[1 - winnerIndex];
  const { id } = results[winnerIndex].body.data;
  assertError(results[1 - winnerIndex], 409, 'Insufficient stock');

  const orders = db.getRepository(Order);
  assert.equal(await orders.countBy({ userId: winner.user.id }), 1);
  assert.equal(await orders.countBy({ userId: loser.user.id }), 0);
  assert.equal(await db.getRepository(OrderItem).countBy({ variantId: variant.id }), 1);
  const stock = await db.getRepository(InventoryStock).findOneByOrFail({ variantId: variant.id });
  assert.equal(stock.quantity, 0);
  const movements = await db.getRepository(InventoryMovement).findBy({ variantId: variant.id });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].actorId, winner.user.id);
  assert.equal(movements[0].delta, -1);
  assert.equal(movements[0].reason, `Order ${id}`);
  assert.deepEqual((await request('/cart', { token: winner.token })).body.data.items, []);
  assert.equal((await request('/cart', { token: loser.token })).body.data.items[0].quantity, 1);
});

test('a cart PUT waits for checkout and survives checkout cart cleanup', async () => {
  const { variants: [variant] } = await createCatalog('checkout-cart-lock');
  const { token, address } = await createBuyer('checkout-cart-lock');
  await insert(InventoryStock, { variantId: variant.id, quantity: 5 });
  const cart = await setCartItem(variant.id, 2, token);
  assert.equal(cart.response.status, 200);

  let pendingCheckout;
  let pendingPut;
  try {
    await db.transaction(async (manager) => {
      await manager.getRepository(InventoryStock).findOneOrFail({
        where: { variantId: variant.id }, lock: { mode: 'pessimistic_write' },
      });
      const [{ pid }] = await manager.query('SELECT pg_backend_pid() AS pid');
      pendingCheckout = checkout(address.id, token);
      const checkoutPid = await waitForBlockedQuery(pid, 'UPDATE "inventory_stock"%');
      pendingPut = setCartItem(variant.id, 4, token);
      await waitForBlockedQuery(checkoutPid, '%FROM "carts"%FOR UPDATE%');
    });
  } finally {
    await Promise.all([pendingCheckout, pendingPut]);
  }

  const placed = await pendingCheckout;
  assert.equal(placed.response.status, 201);
  assert.equal(placed.body.data.items[0].quantity, 2);
  const put = await pendingPut;
  assert.equal(put.response.status, 200);
  const [item] = await db.getRepository(CartItem).findBy({ cartId: cart.body.data.id });
  assert.equal(item.variantId, variant.id);
  assert.equal(item.quantity, 4);
  const stock = await db.getRepository(InventoryStock).findOneByOrFail({ variantId: variant.id });
  assert.equal(stock.quantity, 3);
});

test('stock deduction rolls back order, item, movement, and prior stock changes', async () => {
  const catalog = app.get(CatalogService);
  const inventory = app.get(InventoryService);
  const buyer = await insert(User, {
    email: email('buyer'), name: 'Buyer', passwordHash: await hashPassword(password),
  });
  const category = await insert(Category, { slug: runId, name: 'Shirts' });
  const collection = await insert(Collection, { slug: runId, name: 'Summer' });
  const product = await insert(Product, {
    categoryId: category.id, slug: runId, name: 'Linen Shirt', collections: [collection],
  });

  const inStock = await insert(ProductVariant, {
    productId: product.id, sku: `in-${runId}`, size: 'M', color: 'black', priceMinor: 1000,
  });
  const soldOut = await insert(ProductVariant, {
    productId: product.id, sku: `out-${runId}`, size: 'S', color: 'black', priceMinor: 1000,
  });
  await insert(InventoryStock, { variantId: inStock.id, quantity: 2 });
  await insert(InventoryStock, { variantId: soldOut.id, quantity: 0 });
  const cart = await insert(Cart, { userId: buyer.id });
  const cartItem = await insert(CartItem, { cartId: cart.id, variantId: inStock.id, quantity: 1 });
  const storedProduct = await db.getRepository(Product).findOne({
    where: { id: product.id }, relations: { collections: true },
  });
  assert.equal(storedProduct.collections[0].id, collection.id);

  const orderId = randomUUID();
  await assert.rejects(db.transaction(async (manager) => {
    const variants = await catalog.findSellableVariants(manager, [inStock.id, soldOut.id]);
    assert.equal(variants.length, 2);
    const item = variants.find(({ id }) => id === inStock.id);
    assert.equal(item.productName, product.name);
    assert.equal(item.priceMinor, 1000);

    await insert(Order, {
      id: orderId, userId: buyer.id, totalMinor: 2000,
      shippingAddress: {
        recipientName: 'Buyer', phone: '0123456789', line1: 'Test street',
        line2: null, city: 'Dhaka', postalCode: '1200', countryCode: 'BD',
      },
    }, manager);
    await insert(OrderItem, {
      orderId, variantId: item.id, productName: item.productName, sku: item.sku,
      size: item.size, color: item.color, unitPriceMinor: item.priceMinor, quantity: 1,
    }, manager);
    await inventory.deductStock(manager, inStock.id, 1, buyer.id, orderId);
    assert.equal(await manager.countBy(InventoryMovement, { variantId: inStock.id }), 1);
    await inventory.deductStock(manager, soldOut.id, 1, buyer.id, orderId);
    await manager.delete(CartItem, cartItem.id);
  }), (error) => error.getStatus() === 409);

  assert.equal(await db.getRepository(Order).countBy({ id: orderId }), 0);
  assert.equal(await db.getRepository(OrderItem).countBy({ orderId }), 0);
  assert.equal(await db.getRepository(InventoryMovement).countBy({ variantId: inStock.id }), 0);
  const stock = await db.getRepository(InventoryStock).findOneByOrFail({ variantId: inStock.id });
  assert.equal(stock.quantity, 2);
  assert.equal(await db.getRepository(CartItem).countBy({ id: cartItem.id }), 1);
});

const inventoryPath = '/inventory';
const inventoryPost = (resource, body, token) =>
  request(`${inventoryPath}/${resource}`, { method: 'POST', body, token });

function cleanInventory(variantId) {
  deleteAfter.push([InventoryStock, { variantId }], [InventoryMovement, { variantId }]);
}

test('Inventory Swagger describes all operations and request bodies', async () => {
  const { response, body: doc } = await request('/docs-json');
  assert.equal(response.status, 200);
  for (const [path, method, success] of [
    ['/api/inventory/stock', 'get', 200],
    ['/api/inventory/stock/{variantId}', 'get', 200],
    ['/api/inventory/receipts', 'post', 201],
    ['/api/inventory/adjustments', 'post', 201],
    ['/api/inventory/movements', 'get', 200],
  ]) {
    const operation = doc.paths[path][method];
    assert.deepEqual(operation.tags, ['Inventory']);
    assert.deepEqual(operation.security, [{ bearer: [] }]);
    for (const status of [success, 400, 401, 403]) assert.ok(operation.responses[status]);
  }
  for (const [route, model, amount, example] of [
    ['receipts', 'ReceiveStockDto', 'quantity', 10],
    ['adjustments', 'AdjustStockDto', 'delta', -2],
  ]) {
    const post = doc.paths[`/api/inventory/${route}`].post;
    assert.equal(post.requestBody.content['application/json'].schema.$ref, `#/components/schemas/${model}`);
    const schema = doc.components.schemas[model];
    assert.deepEqual([...schema.required].sort(), [amount, 'reason', 'variantId'].sort());
    assert.equal(schema.properties[amount].example, example);
    assert.ok(post.responses[404]);
    assert.ok(post.responses[409]);
  }
  for (const route of ['stock', 'movements']) {
    const { parameters } = doc.paths[`/api/inventory/${route}`].get;
    assert.equal(parameters.find(({ name }) => name === 'variantId').schema.format, 'uuid');
    assert.equal(parameters.find(({ name }) => name === 'limit').schema.maximum, 100);
  }
});

test('Inventory endpoints allow Admin and reject missing tokens, Customer, and Staff', async () => {
  const { token: customer } = await createActor('inventory-denied-customer');
  const { token: staff } = await createActor('inventory-denied-staff', Role.Staff);
  const { token: admin } = await createActor('inventory-allowed-admin', Role.Admin);
  const missing = randomUUID();
  for (const [path, method, body, adminStatus] of [
    ['/stock', 'GET', undefined, 200],
    [`/stock/${missing}`, 'GET', undefined, 404],
    ['/receipts', 'POST', { variantId: missing, quantity: 1, reason: 'Delivery' }, 404],
    ['/adjustments', 'POST', { variantId: missing, delta: -1, reason: 'Damage' }, 404],
    ['/movements', 'GET', undefined, 200],
  ]) {
    const send = (token) => request(inventoryPath + path, { method, body, token });
    assertError(await send(), 401);
    assertError(await send(customer), 403);
    assertError(await send(staff), 403);
    assert.equal((await send(admin)).response.status, adminStatus);
  }
});

test('Inventory stock reads include variant details and treat missing balances as zero', async () => {
  const { product, variants: [first, second] } = await createCatalog('inventory-stock');
  const { token } = await createActor('inventory-stock', Role.InventoryManager);
  await insert(InventoryStock, { variantId: second.id, quantity: 4 });
  const detail = await request(`${inventoryPath}/stock/${first.id}`, { token });
  const expected = {
    variantId: first.id, productId: product.id, sku: first.sku, productName: product.name,
    size: first.size, color: first.color, quantity: 0,
  };
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.body.data, expected);
  assert.equal(await db.getRepository(InventoryStock).countBy({ variantId: first.id }), 0);

  const all = await request(`${inventoryPath}/stock?limit=100`, { token });
  assert.equal(all.response.status, 200);
  const skus = all.body.data.map(({ sku }) => sku);
  assert.deepEqual(skus, [...skus].sort());
  assert.equal(all.body.data.find(({ variantId }) => variantId === second.id).quantity, 4);
  const filtered = `${inventoryPath}/stock?variantId=${first.id}&limit=1`;
  const firstPage = await request(filtered, { token });
  assert.deepEqual(firstPage.body, { success: true, data: [expected], meta: { page: 1, limit: 1, total: 1 } });
  const secondPage = await request(filtered + '&page=2', { token });
  assert.deepEqual(secondPage.body, { success: true, data: [], meta: { page: 2, limit: 1, total: 1 } });
});

test('Inventory receipts and signed adjustments persist stock and attributable movements', async () => {
  const { variants: [first, second] } = await createCatalog('inventory-change');
  const { user, token } = await createActor('inventory-change', Role.InventoryManager);
  const { user: admin, token: adminToken } = await createActor('inventory-receive-admin', Role.Admin);
  cleanInventory(first.id);
  cleanInventory(second.id);

  for (const [resource, fields, actorId, bearer, quantity, type, delta] of [
    ['receipts', { quantity: 10 }, user.id, token, 10, MovementType.Receipt, 10],
    ['receipts', { quantity: 2 }, admin.id, adminToken, 12, MovementType.Receipt, 2],
    ['adjustments', { delta: 3 }, user.id, token, 15, MovementType.Adjustment, 3],
    ['adjustments', { delta: -4 }, user.id, token, 11, MovementType.Adjustment, -4],
  ]) {
    const changed = await inventoryPost(resource, { ...fields, variantId: first.id, reason: '  Count update  ' }, bearer);
    assert.equal(changed.response.status, 201);
    assert.equal(changed.body.success, true);
    const { movement, ...balance } = changed.body.data;
    assert.deepEqual(balance, { variantId: first.id, quantity });
    const { id, createdAt } = movement;
    assert.ok(id);
    assert.ok(Number.isFinite(Date.parse(createdAt)));
    assert.deepEqual(movement, { id, createdAt, variantId: first.id, actorId, type, delta, reason: 'Count update' });
    const persisted = await db.getRepository(InventoryMovement).findOneByOrFail({ id });
    assert.equal(persisted.type, type);
    assert.equal(persisted.delta, delta);
    assert.equal(persisted.actorId, actorId);
    const stock = await db.getRepository(InventoryStock).findOneByOrFail({ variantId: first.id });
    assert.equal(stock.quantity, quantity);
  }

  assertError(await inventoryPost('adjustments', { variantId: first.id, delta: -12, reason: 'Damage' }, token),
    409, 'Adjustment would make stock negative');
  assertError(await inventoryPost('adjustments', { variantId: second.id, delta: -1, reason: 'Damage' }, token),
    409, 'Adjustment would make stock negative');
  assert.equal(await db.getRepository(InventoryMovement).countBy({ variantId: first.id }), 4);
  assert.equal(await db.getRepository(InventoryStock).countBy({ variantId: second.id }), 0);
  const createdByAdjustment = await inventoryPost('adjustments', { variantId: second.id, delta: 1, reason: 'Correction' }, token);
  assert.equal(createdByAdjustment.response.status, 201);
  assert.equal(createdByAdjustment.body.data.quantity, 1);
});

test('Inventory rejects invalid quantities, reasons, UUIDs, unknown variants, and overflow', async () => {
  const { variants: [variant] } = await createCatalog('inventory-validation');
  const { token } = await createActor('inventory-validation', Role.InventoryManager);
  const good = { variantId: variant.id, reason: 'Delivery' };
  await insert(InventoryStock, { variantId: variant.id, quantity: 2_147_483_647 });
  for (const quantity of [0, -1, 0.5, '1', 2_147_483_648]) {
    assertError(await inventoryPost('receipts', { ...good, quantity }, token), 400);
  }
  for (const delta of [0, 0.5, '-1', -2_147_483_649, 2_147_483_648]) {
    assertError(await inventoryPost('adjustments', { ...good, delta }, token), 400);
  }
  for (const reason of [undefined, ' ', 'a'.repeat(241), 'hello\u0000world']) {
    const invalid = await inventoryPost('receipts', { ...good, quantity: 1, reason }, token);
    assertError(invalid, 400);
    assert.ok(invalid.body.message.some((message) => message.includes('reason')));
  }
  assertError(await inventoryPost('receipts', { ...good, variantId: 'bad', quantity: 1 }, token), 400);
  assertError(await request(`${inventoryPath}/stock/bad`, { token }), 400);
  assertError(await request(`${inventoryPath}/movements?variantId=bad`, { token }), 400);
  assertError(await request(`${inventoryPath}/stock?limit=101`, { token }), 400);
  assertError(await request(`${inventoryPath}/stock/${randomUUID()}`, { token }), 404, 'Variant not found');
  assertError(await inventoryPost('receipts', { ...good, variantId: randomUUID(), quantity: 1 }, token), 404, 'Variant not found');
  assertError(await inventoryPost('receipts', { ...good, quantity: 1 }, token), 409, 'Stock limit exceeded');
  assertError(await inventoryPost('adjustments', { ...good, delta: -2_147_483_648 }, token),
    409, 'Adjustment would make stock negative');
  assert.equal(await db.getRepository(InventoryMovement).countBy({ variantId: variant.id }), 0);
  assert.equal((await db.getRepository(InventoryStock).findOneByOrFail({ variantId: variant.id })).quantity,
    2_147_483_647);
});

test('concurrent first receipts and decreases share one balance without losing stock updates', async () => {
  const { variants: [variant] } = await createCatalog('inventory-concurrent');
  const { token } = await createActor('inventory-concurrent', Role.InventoryManager);
  cleanInventory(variant.id);
  const payload = { variantId: variant.id, reason: 'Concurrent stock check' };
  const receipts = await Promise.all([4, 3].map((quantity) =>
    inventoryPost('receipts', { ...payload, quantity }, token)));
  assert.deepEqual(receipts.map(({ response }) => response.status), [201, 201]);
  const stock = db.getRepository(InventoryStock);
  assert.equal(await stock.countBy({ variantId: variant.id }), 1);
  assert.equal((await stock.findOneByOrFail({ variantId: variant.id })).quantity, 7);
  const decreases = await Promise.all([1, 2].map(() =>
    inventoryPost('adjustments', { ...payload, delta: -5 }, token)));
  assert.deepEqual(decreases.map(({ response }) => response.status).sort(), [201, 409]);
  assert.equal((await stock.findOneByOrFail({ variantId: variant.id })).quantity, 2);
  assert.equal(await db.getRepository(InventoryMovement).countBy({ variantId: variant.id }), 3);
});

test('failed Inventory movement inserts roll back existing and newly created stock balances', async () => {
  const { variants: [first, second] } = await createCatalog('inventory-rollback');
  const stock = db.getRepository(InventoryStock);
  await insert(InventoryStock, { variantId: first.id, quantity: 7 });
  const inventory = app.get(InventoryService);
  // An invalid actor fails the real movement FK after the balance has already been written.
  for (const variant of [first, second]) {
    await assert.rejects(
      inventory.receive({ variantId: variant.id, quantity: 4, reason: 'Rollback check' }, randomUUID()),
      { code: '23503' },
    );
    assert.equal(await db.getRepository(InventoryMovement).countBy({ variantId: variant.id }), 0);
  }
  assert.equal((await stock.findOneByOrFail({ variantId: first.id })).quantity, 7);
  assert.equal(await stock.countBy({ variantId: second.id }), 0);
});

test('Inventory movement pagination includes Customer checkout sales with the order reference', async () => {
  const { variants: [variant, other] } = await createCatalog('inventory-history');
  const { token } = await createActor('inventory-history', Role.InventoryManager);
  const buyer = await createBuyer('inventory-history-buyer');
  cleanInventory(variant.id);
  cleanInventory(other.id);
  const receipt = await inventoryPost('receipts', { variantId: variant.id, quantity: 6, reason: 'Delivery' }, token);
  assert.equal(receipt.response.status, 201);
  assert.equal((await inventoryPost('receipts', { variantId: other.id, quantity: 1, reason: 'Other variant' }, token))
    .response.status, 201);
  assert.equal((await setCartItem(variant.id, 2, buyer.token)).response.status, 200);
  const order = await checkout(buyer.address.id, buyer.token);
  assert.equal(order.response.status, 201);

  const path = `${inventoryPath}/movements?variantId=${variant.id}&limit=1`;
  const list = await request(path, { token });
  assert.equal(list.response.status, 200);
  assert.deepEqual(list.body.meta, { page: 1, limit: 1, total: 2 });
  const [sale] = list.body.data;
  assert.deepEqual(sale, {
    id: sale.id, createdAt: sale.createdAt, variantId: variant.id, actorId: buyer.user.id,
    type: MovementType.Sale, delta: -2, reason: `Order ${order.body.data.id}`,
  });
  const pageTwo = await request(path + '&page=2', { token });
  assert.equal(pageTwo.response.status, 200);
  assert.deepEqual(pageTwo.body, {
    success: true, data: [receipt.body.data.movement], meta: { page: 2, limit: 1, total: 2 },
  });
  assert.equal((await db.getRepository(InventoryStock).findOneByOrFail({ variantId: variant.id })).quantity, 4);
});

const staffPath = '/staff';
const catalogLabel = (name) => `${name}-${runId}`;

function staffRequest(path, token, method = 'GET', body, signal) {
  return request(staffPath + path, { method, body, token, signal });
}

async function createStaffRecord(resource, Entity, fields, token) {
  const result = await staffRequest(`/${resource}`, token, 'POST', fields);
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.success, true);
  deleteAfter.push([Entity, result.body.data.id]);
  return result.body.data;
}

test('Staff Swagger documents 20 protected operations and two public product reads', async () => {
  const { response, body: doc } = await request('/docs-json');
  assert.equal(response.status, 200);
  for (const [resource, name, tag] of [
    ['categories', 'Category', 'Categories'],
    ['collections', 'Collection', 'Collections'],
    ['products', 'Product', 'Products'],
    ['variants', 'Variant', 'Variants'],
  ]) {
    for (const [suffix, method, status, model] of [
      ['', 'post', 201, `Create${name}Dto`], ['', 'get', 200],
      ['/{id}', 'get', 200], ['/{id}', 'patch', 200, `Update${name}Dto`], ['/{id}', 'delete', 204],
    ]) {
      const operation = doc.paths[`/api/staff/${resource}${suffix}`][method];
      assert.deepEqual(operation.tags, [`Staff — ${tag}`]);
      assert.deepEqual(operation.security, [{ bearer: [] }]);
      for (const code of [status, 400, 401, 403]) assert.ok(operation.responses[code]);
      if (model) {
        assert.equal(operation.requestBody.content['application/json'].schema.$ref, `#/components/schemas/${model}`);
      }
      if (status === 204) assert.equal(operation.responses[204].content, undefined);
    }
  }
  for (const path of ['/api/products', '/api/products/{id}']) {
    const operation = doc.paths[path].get;
    assert.deepEqual(operation.tags, ['Public Catalog']);
    assert.equal(operation.security, undefined);
    assert.ok(operation.responses[200]);
  }
  const dto = doc.components.schemas;
  assert.equal(dto.CreateVariantDto.properties.priceMinor.type, 'integer');
  assert.equal(dto.UpdateVariantDto.properties.productId, undefined);
  assert.equal(dto.CreateCollectionDto.properties.isActive.type, 'boolean');
});

test('Staff routes enforce the role matrix and public catalog accepts any caller', async () => {
  const { token: staff } = await createActor('catalog-staff', Role.Staff);
  const { token: admin } = await createActor('catalog-admin', Role.Admin);
  const { token: customer } = await createActor('catalog-customer');
  const { token: inventory } = await createActor('catalog-inventory', Role.InventoryManager);
  const id = randomUUID();
  for (const resource of ['categories', 'collections', 'products', 'variants']) {
    for (const [path, method, body, expected] of [
      [`/${resource}`, 'GET', undefined, 200],
      [`/${resource}`, 'POST', {}, 400],
      [`/${resource}/${id}`, 'GET', undefined, 404],
      [`/${resource}/${id}`, 'PATCH', {}, 404],
      [`/${resource}/${id}`, 'DELETE', undefined, 404],
    ]) {
      for (const [token, status] of [[undefined, 401], [customer, 403], [inventory, 403], [staff, expected], [admin, expected]]) {
        assert.equal((await staffRequest(path, token, method, body)).response.status, status);
      }
    }
  }
  for (const token of [undefined, customer, inventory, staff, admin]) {
    assert.equal((await request('/products', { token })).response.status, 200);
  }
});

test('Staff performs Category and Collection CRUD with pagination and duplicate protection', async () => {
  const { token } = await createActor('catalog-entries', Role.Staff);
  for (const [resource, Entity, fields] of [
    ['categories', Category, {}], ['collections', Collection, { isActive: false }],
  ]) {
    const input = { name: 'A campus line', slug: catalogLabel(`000-${resource}`), description: 'Summer line', ...fields };
    const entry = await createStaffRecord(resource, Entity, input, token);
    const second = await createStaffRecord(resource, Entity, {
      name: 'Another line', slug: catalogLabel(`001-${resource}`),
    }, token);
    const path = `/${resource}/${entry.id}`;
    const firstPage = await staffRequest(`/${resource}?limit=1&page=1`, token);
    const nextPage = await staffRequest(`/${resource}?limit=1&page=2`, token);
    assert.equal(firstPage.response.status, 200);
    assert.equal(nextPage.response.status, 200);
    assert.equal(firstPage.body.data.length, 1);
    assert.equal(nextPage.body.data.length, 1);
    assert.ok(firstPage.body.data[0].slug < nextPage.body.data[0].slug);
    assert.deepEqual(nextPage.body.meta, { page: 2, limit: 1, total: firstPage.body.meta.total });
    const read = await staffRequest(path, token);
    assert.equal(read.response.status, 200);
    assert.deepEqual(read.body.data, entry);
    assertError(await staffRequest(`/${resource}`, token, 'POST', input), 409);
    assertError(await staffRequest(path, token, 'PATCH', { slug: second.slug }), 409);
    assertError(await staffRequest(path, token, 'PATCH', { name: null }), 400);
    assertError(await staffRequest(`/${resource}`, token, 'POST', { ...input, slug: 'Invalid slug' }), 400);
    assertError(await staffRequest(`/${resource}/not-a-uuid`, token), 400);
    const updated = await staffRequest(path, token, 'PATCH', {
      name: 'Updated line', description: null, ...(resource === 'collections' ? { isActive: true } : {}),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.data.name, 'Updated line');
    assert.equal(updated.body.data.description, null);
    if (resource === 'collections') assert.equal(updated.body.data.isActive, true);
    const deleted = await staffRequest(path, token, 'DELETE');
    assert.equal(deleted.response.status, 204);
    assert.equal(deleted.body, '');
    assertError(await staffRequest(path, token), 404);
    assertError(await staffRequest(path, token, 'DELETE'), 404);
  }
});

test('Staff product CRUD checks relationships, updates membership, and preserves linked products on collection deletion', async () => {
  const { token } = await createActor('catalog-products', Role.Staff);
  const category = await createStaffRecord('categories', Category, { name: 'Shirts', slug: catalogLabel('product-category') }, token);
  const replacement = await createStaffRecord('categories', Category, {
    name: 'Overshirts', slug: catalogLabel('replacement-category'),
  }, token);
  const collection = await createStaffRecord('collections', Collection, { name: 'Summer', slug: catalogLabel('summer') }, token);
  const input = {
    name: 'Linen shirt', slug: catalogLabel('linen-shirt'), categoryId: category.id,
    collectionIds: [collection.id], isActive: false,
  };
  assertError(await staffRequest('/products', token, 'POST', { ...input, categoryId: randomUUID() }), 404);
  assertError(await staffRequest('/products', token, 'POST', { ...input, collectionIds: [collection.id, randomUUID()] }), 404);
  assertError(await staffRequest('/products', token, 'POST', { ...input, collectionIds: [collection.id, collection.id.toUpperCase()] }), 400);
  const product = await createStaffRecord('products', Product, input, token);
  const path = `/products/${product.id}`;
  const read = await staffRequest(path, token);
  assert.equal(read.response.status, 200);
  assert.deepEqual(read.body.data, product);
  assert.deepEqual(product.collectionIds, input.collectionIds);
  const filtered = await staffRequest(`/products?categoryId=${category.id}&isActive=false&limit=1`, token);
  assert.deepEqual(filtered.body, { success: true, data: [product], meta: { page: 1, limit: 1, total: 1 } });
  assertError(await staffRequest('/products?isActive=invalid', token), 400);
  assertError(await staffRequest(`/categories/${category.id}`, token, 'DELETE'), 409);
  assertError(await staffRequest(path, token, 'PATCH', { name: 'Must roll back', collectionIds: [randomUUID()] }), 404);
  assert.deepEqual((await staffRequest(path, token)).body.data, product);

  const cleared = await staffRequest(path, token, 'PATCH', {
    categoryId: replacement.id, collectionIds: [], isActive: true,
  });
  assert.equal(cleared.response.status, 200);
  assert.deepEqual(cleared.body.data.collectionIds, []);
  assert.equal(cleared.body.data.categoryId, replacement.id);
  assert.equal(cleared.body.data.isActive, true);
  const linked = await staffRequest(path, token, 'PATCH', { collectionIds: [collection.id] });
  assert.equal(linked.response.status, 200);
  assert.deepEqual(linked.body.data.collectionIds, [collection.id]);
  assert.equal((await staffRequest(`/collections/${collection.id}`, token, 'DELETE')).response.status, 204);
  const afterUnlink = await staffRequest(path, token);
  assert.equal(afterUnlink.response.status, 200);
  assert.deepEqual(afterUnlink.body.data.collectionIds, []);
  assert.equal((await staffRequest(path, token, 'DELETE')).response.status, 204);
  assertError(await staffRequest(path, token), 404);
});

test('Staff variant CRUD validates pricing and relationships and deletes an unused zero balance', async () => {
  const { token } = await createActor('catalog-variants', Role.Staff);
  const { product } = await createCatalog('catalog-variants');
  const input = { productId: product.id, sku: catalogLabel('SKU'), size: 'XL', color: 'Red', priceMinor: 120000 };
  for (const priceMinor of [-1, 0.1, '100', 2_147_483_648]) {
    assertError(await staffRequest('/variants', token, 'POST', { ...input, priceMinor }), 400);
  }
  assertError(await staffRequest('/variants', token, 'POST', { ...input, productId: randomUUID() }), 404);
  const variant = await createStaffRecord('variants', ProductVariant, input, token);
  const path = `/variants/${variant.id}`;
  assert.equal(variant.isActive, true);
  const detail = await staffRequest(path, token);
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.body.data, variant);
  const filtered = await staffRequest(`/variants?productId=${product.id}&limit=1`, token);
  assert.equal(filtered.response.status, 200);
  assert.deepEqual(filtered.body.meta, { page: 1, limit: 1, total: 3 });
  assertError(await staffRequest('/variants', token, 'POST', { ...input, size: 'XS' }), 409);
  assertError(await staffRequest('/variants', token, 'POST', { ...input, sku: catalogLabel('ANOTHER-SKU') }), 409);
  assertError(await staffRequest(path, token, 'PATCH', { productId: product.id }), 400);
  assertError(await staffRequest(path, token, 'PATCH', { priceMinor: null }), 400);
  const changed = await staffRequest(path, token, 'PATCH', { priceMinor: 0, isActive: false });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.data.priceMinor, 0);
  assert.equal(changed.body.data.isActive, false);
  assertError(await staffRequest(`/products/${product.id}`, token, 'DELETE'), 409);

  const balance = await insert(InventoryStock, { variantId: variant.id, quantity: 1 });
  assertError(await staffRequest(path, token, 'DELETE'), 409);
  const stock = db.getRepository(InventoryStock);
  assert.equal((await stock.findOneByOrFail({ id: balance.id })).quantity, 1);
  await stock.update(balance.id, { quantity: 0 });
  const deleted = await staffRequest(path, token, 'DELETE');
  assert.equal(deleted.response.status, 204);
  assert.equal(deleted.body, '');
  assert.equal(await stock.countBy({ id: balance.id }), 0);
  assertError(await staffRequest(path, token), 404);
});

test('public product pages hide inactive products and variants and page products without duplicating them', async () => {
  const { token } = await createActor('catalog-public', Role.Staff);
  const category = await createStaffRecord('categories', Category, { name: 'Basics', slug: catalogLabel('public-category') }, token);
  const products = [];
  for (const [suffix, isActive] of [['a', true], ['b', true], ['c', false]]) {
    products.push(await createStaffRecord('products', Product, {
      name: 'Public shirt ' + suffix, slug: catalogLabel('public-shirt-' + suffix), categoryId: category.id, isActive,
    }, token));
  }
  const [first, second, hidden] = products;
  const input = { productId: first.id, priceMinor: 120000, color: 'Black' };
  const visible = await createStaffRecord('variants', ProductVariant, { ...input, sku: catalogLabel('PUB-M'), size: 'M' }, token);
  await createStaffRecord('variants', ProductVariant, { ...input, sku: catalogLabel('PUB-L'), size: 'L' }, token);
  await createStaffRecord('variants', ProductVariant, { ...input, sku: catalogLabel('PUB-S'), size: 'S', isActive: false }, token);
  const filter = `/products?categoryId=${category.id}&limit=1`;
  const firstPage = await request(filter);
  const secondPage = await request(filter + '&page=2');
  assert.equal(firstPage.response.status, 200);
  assert.equal(secondPage.response.status, 200);
  assert.equal(firstPage.body.data[0].id, first.id);
  assert.equal(secondPage.body.data[0].id, second.id);
  assert.deepEqual(secondPage.body.meta, { page: 2, limit: 1, total: 2 });
  const detail = await request(`/products/${first.id}`);
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.body.data, firstPage.body.data[0]);
  assert.deepEqual(detail.body.data.category, { id: category.id, name: category.name, slug: category.slug });
  assert.equal(detail.body.data.variants.length, 2);
  assert.deepEqual(detail.body.data.variants[1], {
    id: visible.id, sku: visible.sku, size: 'M', color: 'Black', priceMinor: 120000,
  });
  assert.equal(detail.body.data.isActive, undefined);
  assertError(await request(`/products/${hidden.id}`), 404);
  assertError(await request('/products/bad-uuid'), 400);
  assertError(await request('/products?categoryId=bad'), 400);
});

test('protected variant deletion rolls back zero-balance cleanup for cart references and concurrent locks', async () => {
  const { token } = await createActor('catalog-delete-conflict', Role.Staff);
  const { variants: [inCart, locked] } = await createCatalog('catalog-delete-conflict');
  const { token: customer } = await createActor('catalog-delete-cart');
  const inCartStock = await insert(InventoryStock, { variantId: inCart.id, quantity: 0 });
  const lockedStock = await insert(InventoryStock, { variantId: locked.id, quantity: 0 });
  const stock = db.getRepository(InventoryStock);
  assert.equal((await setCartItem(inCart.id, 1, customer)).response.status, 200);
  assertError(await staffRequest(`/variants/${inCart.id}`, token, 'DELETE'), 409);
  assert.equal((await stock.findOneByOrFail({ id: inCartStock.id })).quantity, 0);
  assert.equal((await request('/cart', { token: customer })).body.data.items[0].variantId, inCart.id);
  assert.equal((await removeCartItem(inCart.id, customer)).response.status, 204);
  assert.equal((await staffRequest(`/variants/${inCart.id}`, token, 'DELETE')).response.status, 204);

  await db.transaction(async (manager) => {
    await manager.getRepository(ProductVariant).findOneOrFail({
      where: { id: locked.id }, lock: { mode: 'for_key_share' },
    });
    assertError(await staffRequest(`/variants/${locked.id}`, token, 'DELETE', undefined, AbortSignal.timeout(5000)),
      409, 'Variant is in use by another operation');
    assert.equal((await stock.findOneByOrFail({ id: lockedStock.id })).quantity, 0);
  });
});

test('a Staff-created variant can receive stock and be purchased, and historical references survive catalog edits', async () => {
  const { token } = await createActor('catalog-integration', Role.Staff);
  const { token: manager } = await createActor('catalog-integration-inventory', Role.InventoryManager);
  const category = await createStaffRecord('categories', Category, { name: 'Shirts', slug: catalogLabel('integrated-category') }, token);
  const product = await createStaffRecord('products', Product, {
    name: 'Linen shirt', slug: catalogLabel('integrated-shirt'), categoryId: category.id, isActive: false,
  }, token);
  const variant = await createStaffRecord('variants', ProductVariant, {
    productId: product.id, sku: catalogLabel('INTEGRATED-M'), size: 'M', color: 'Blue', priceMinor: 120000,
  }, token);
  const buyer = await createBuyer('catalog-integration-buyer');
  cleanInventory(variant.id);
  const receipt = await inventoryPost('receipts', { variantId: variant.id, quantity: 2, reason: 'Delivery' }, manager);
  assert.equal(receipt.response.status, 201);
  assertError(await setCartItem(variant.id, 2, buyer.token), 409);
  assert.equal((await staffRequest(`/products/${product.id}`, token, 'PATCH', { isActive: true })).response.status, 200);
  assert.equal((await setCartItem(variant.id, 2, buyer.token)).response.status, 200);
  const order = await checkout(buyer.address.id, buyer.token);
  assert.equal(order.response.status, 201);
  assert.equal(order.body.data.totalMinor, 240000);
  const balance = await request(`/inventory/stock/${variant.id}`, { token: manager });
  assert.equal(balance.body.data.quantity, 0);
  const path = `/variants/${variant.id}`;
  assertError(await staffRequest(path, token, 'DELETE'), 409);
  assert.equal(await db.getRepository(InventoryStock).countBy({ variantId: variant.id, quantity: 0 }), 1);
  const movements = await request(`/inventory/movements?variantId=${variant.id}`, { token: manager });
  assert.deepEqual(movements.body.data.map(({ type, delta }) => [type, delta]), [['sale', -2], ['receipt', 2]]);

  assert.equal((await staffRequest(path, token, 'PATCH', { priceMinor: 125000, isActive: false })).response.status, 200);
  assert.equal((await staffRequest(`/products/${product.id}`, token, 'PATCH', { name: 'Renamed shirt' })).response.status, 200);
  const history = await request(`/orders/${order.body.data.id}`, { token: buyer.token });
  assert.equal(history.response.status, 200);
  assert.deepEqual(history.body.data, order.body.data);
  assert.deepEqual((await request(`/products/${product.id}`)).body.data.variants, []);
});

const staffAccountsPath = '/admin/staff';

function adminRequest(path, token, method = 'GET', body) {
  return request(path, { token, method, body });
}

async function createManagedAccount(token, label, role, fields = {}) {
  const result = await adminRequest(staffAccountsPath, token, 'POST', {
    name: 'Managed Account', email: email(label), password, role, ...fields,
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  const account = result.body.data;
  deleteAfter.push([User, account.id]);
  assert.deepEqual(Object.keys(account).sort(),
    ['id', 'email', 'name', 'role', 'isActive', 'createdAt', 'updatedAt'].sort());
  assert.equal(result.body.success, true);
  assert.equal(account.role, role);
  assert.equal(account.isActive, true);
  return account;
}

function loginManaged(emailAddress) {
  return request('/auth/login', { method: 'POST', body: { email: emailAddress, password } });
}

test('Admin Swagger documents account lifecycle, managed roles, and safe schemas', async () => {
  const { response, body: doc } = await request('/docs-json');
  assert.equal(response.status, 200);
  for (const [path, method, success] of [
    ['/api/admin/access', 'get', 200],
    ['/api/admin/staff', 'post', 201],
    ['/api/admin/staff', 'get', 200],
    ['/api/admin/staff/{id}', 'get', 200],
    ['/api/admin/staff/{id}', 'patch', 200],
    ['/api/admin/staff/{id}', 'delete', 204],
  ]) {
    const operation = doc.paths[path][method];
    assert.deepEqual(operation.tags, ['Admin']);
    assert.deepEqual(operation.security, [{ bearer: [] }]);
    for (const code of [success, 401, 403]) assert.ok(operation.responses[code]);
    if (path.endsWith('/{id}')) assert.ok(operation.responses[404]);
    if (path !== '/api/admin/access') assert.ok(operation.responses[400]);
    if (success === 204) assert.equal(operation.responses[204].content, undefined);
  }
  const contentType = 'application/json';
  const post = doc.paths['/api/admin/staff'].post;
  const examples = post.requestBody.content[contentType].examples;
  assert.deepEqual(Object.values(examples).map(({ value }) => value.role).sort(), [Role.InventoryManager, Role.Staff]);
  assert.ok(post.responses[409]);
  const patch = doc.paths['/api/admin/staff/{id}'].patch;
  assert.ok(patch.responses[409]);
  const parameters = doc.paths['/api/admin/staff'].get.parameters;
  assert.ok(parameters.some(({ name, schema }) => name === 'limit' && schema.maximum === 100));
  assert.ok(parameters.some(({ name, schema }) => name === 'isActive' && schema.type === 'boolean'));
  const schemas = doc.components.schemas;
  assert.deepEqual(schemas.ManagedStaffRole.enum, [Role.Staff, Role.InventoryManager]);
  assert.ok(schemas.CreateStaffAccountDto.properties.password);
  assert.equal(schemas.UpdateStaffAccountDto.properties.password, undefined);
  assert.equal(schemas.StaffAccountResponseDto.properties.passwordHash, undefined);
  assert.equal(schemas.StaffAccountResponseDto.properties.password, undefined);
});

test('all Admin operations require an active Admin JWT', async () => {
  const { token: admin } = await createActor('management-rbac-admin', Role.Admin);
  const { token: customer } = await createActor('management-rbac-customer');
  const { token: staff } = await createActor('management-rbac-staff', Role.Staff);
  const { token: inventory } = await createActor('management-rbac-inventory', Role.InventoryManager);
  const unknownAccount = `${staffAccountsPath}/${randomUUID()}`;
  for (const [path, method, adminStatus] of [
    ['/admin/access', 'GET', 200],
    [staffAccountsPath, 'GET', 200],
    [staffAccountsPath, 'POST', 400],
    [unknownAccount, 'GET', 404],
    [unknownAccount, 'PATCH', 404],
    [unknownAccount, 'DELETE', 404],
  ]) {
    const body = ['POST', 'PATCH'].includes(method) ? {} : undefined;
    assertError(await adminRequest(path, undefined, method, body), 401);
    for (const token of [customer, staff, inventory]) {
      assertError(await adminRequest(path, token, method, body), 403);
    }
    assert.equal((await adminRequest(path, admin, method, body)).response.status, adminStatus);
  }
  assertError(await request('/customers/me', { token: admin }), 403);
});

test('Admin creates active Staff and Inventory Manager accounts with normalized email and bcrypt hashes', async () => {
  const { token: admin } = await createActor('management-create-admin', Role.Admin);
  for (const [role, allowed, forbidden] of [
    [Role.Staff, '/staff/categories', '/inventory/stock'],
    [Role.InventoryManager, '/inventory/stock', '/staff/categories'],
  ]) {
    const label = `created-${role}`;
    const normalized = email(label);
    const account = await createManagedAccount(admin, label, role, {
      name: '  New managed account  ', email: ` ${normalized.toUpperCase()} `,
    });
    assert.equal(account.name, 'New managed account');
    assert.equal(account.email, normalized);
    assert.ok(Number.isFinite(Date.parse(account.createdAt)));
    assert.ok(Number.isFinite(Date.parse(account.updatedAt)));
    const stored = await db.getRepository(User).createQueryBuilder('account')
      .addSelect('account.passwordHash').where('account.id = :id', { id: account.id }).getOneOrFail();
    assert.match(stored.passwordHash, /^\$2[ab]\$12\$/);
    assert.notEqual(stored.passwordHash, password);

    const signedIn = await loginManaged(account.email.toUpperCase());
    assert.equal(signedIn.response.status, 200);
    assert.deepEqual(signedIn.body.data.user, { id: account.id, name: account.name, email: account.email, role });
    const { accessToken } = signedIn.body.data;
    assert.equal((await request(allowed, { token: accessToken })).response.status, 200);
    assertError(await request(forbidden, { token: accessToken }), 403);
    assertError(await adminRequest(staffAccountsPath, admin, 'POST', {
      name: 'Duplicate email', email: normalized.toUpperCase(), password, role,
    }), 409);
  }
});

test('Admin creation rejects invalid identity fields, weak passwords, and escalation attempts', async () => {
  const { token: admin } = await createActor('management-validation-admin', Role.Admin);
  const body = { name: 'New staff', email: email('management-invalid'), password, role: Role.Staff };
  for (const invalid of [
    { name: ' ' }, { name: 'x'.repeat(101) }, { name: 'x\u0000y' },
    { email: 'bad-email' }, { password: 'short' }, { password: 'é'.repeat(37) },
    { role: Role.Admin }, { role: Role.Customer }, { role: null }, { role: undefined },
    { isActive: false }, { passwordHash: 'submitted-hash' },
  ]) {
    assertError(await adminRequest(staffAccountsPath, admin, 'POST', { ...body, ...invalid }), 400);
  }
  assertError(await request('/auth/register', {
    method: 'POST', body: { ...body, role: Role.Admin },
  }), 400);
  assert.equal(await db.getRepository(User).countBy({ email: body.email }), 0);
});

test('Admin reads only managed accounts with deterministic pagination and role and status filters', async () => {
  const { user: adminUser, token: admin } = await createActor('management-page-admin', Role.Admin);
  const { user: customer } = await createActor('management-page-customer');
  const second = await createManagedAccount(admin, 'management-page-second', Role.Staff, { name: '001 Staff' });
  const first = await createManagedAccount(admin, 'management-page-first', Role.Staff, { name: '000 Staff' });
  const inventory = await createManagedAccount(admin, 'management-page-inventory', Role.InventoryManager);
  for (const account of [first, second]) {
    const result = await adminRequest(`${staffAccountsPath}/${account.id}`, admin, 'PATCH', { isActive: false });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.isActive, false);
  }
  const filter = `${staffAccountsPath}?role=staff&isActive=false&limit=1`;
  for (const [index, account] of [first, second].entries()) {
    const result = await adminRequest(filter + '&page=' + (index + 1), admin);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.meta, { page: index + 1, limit: 1, total: 2 });
    assert.equal(result.body.data[0].id, account.id);
    assert.equal(result.body.data[0].passwordHash, undefined);
  }
  const all = await adminRequest(staffAccountsPath + '?limit=100', admin);
  assert.equal(all.response.status, 200);
  assert.ok(all.body.data.some(({ id }) => id === inventory.id));
  assert.ok(all.body.data.every(({ role }) => [Role.Staff, Role.InventoryManager].includes(role)));
  for (const id of [adminUser.id, customer.id, randomUUID()]) {
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      assertError(await adminRequest(`${staffAccountsPath}/${id}`, admin, method,
        method === 'PATCH' ? { name: 'Disallowed' } : undefined), 404, 'Managed account not found');
    }
  }
  assert.equal((await db.getRepository(User).findOneByOrFail({ id: customer.id })).isActive, true);
  const detail = await adminRequest(`${staffAccountsPath}/${inventory.id}`, admin);
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.body.data, inventory);
  assertError(await adminRequest(staffAccountsPath + '/bad-uuid', admin), 400);
  for (const query of ['?role=admin', '?isActive=yes', '?limit=101']) {
    assertError(await adminRequest(staffAccountsPath + query, admin), 400);
  }
});

test('Admin can update identity and managed roles without changing passwords or permitting escalation', async () => {
  const { token: admin } = await createActor('management-update-admin', Role.Admin);
  const staff = await createManagedAccount(admin, 'management-update-staff', Role.Staff);
  const duplicate = await createManagedAccount(admin, 'management-update-duplicate', Role.InventoryManager);
  const path = `${staffAccountsPath}/${staff.id}`;
  const initialLogin = await loginManaged(staff.email);
  assert.equal(initialLogin.response.status, 200);
  const { accessToken } = initialLogin.body.data;
  assertError(await adminRequest(path, admin, 'PATCH', { email: ` ${duplicate.email.toUpperCase()} ` }), 409);
  for (const invalid of [
    { role: Role.Admin }, { role: Role.Customer }, { role: null }, { email: null },
    { name: null }, { isActive: null }, { isActive: 'false' }, { password: 'Unchanged123!' },
  ]) {
    assertError(await adminRequest(path, admin, 'PATCH', invalid), 400);
  }
  const renamed = email('management-renamed');
  const updated = await adminRequest(path, admin, 'PATCH', {
    name: '  Renamed Staff ', email: ` ${renamed.toUpperCase()} `, role: Role.InventoryManager,
  });
  assert.equal(updated.response.status, 200);
  assert.deepEqual(updated.body.data, {
    ...staff, name: 'Renamed Staff', email: renamed, role: Role.InventoryManager,
    updatedAt: updated.body.data.updatedAt,
  });
  assertError(await loginManaged(staff.email), 401);
  assert.equal((await loginManaged(renamed)).response.status, 200);
  assertError(await request('/staff/categories', { token: accessToken }), 403);
  assert.equal((await request('/inventory/stock', { token: accessToken })).response.status, 200);
});

test('deactivating Staff or Inventory accounts blocks login and existing JWTs and preserves movement attribution', async () => {
  const { token: admin } = await createActor('management-deactivate-admin', Role.Admin);
  const staff = await createManagedAccount(admin, 'management-deactivate-staff', Role.Staff);
  const manager = await createManagedAccount(admin, 'deactivate-inventory', Role.InventoryManager);
  const { variants: [variant] } = await createCatalog('management-attribution');
  cleanInventory(variant.id);
  let movement;
  for (const [account, allowed] of [[staff, '/staff/categories'], [manager, '/inventory/stock']]) {
    const login = await loginManaged(account.email);
    assert.equal(login.response.status, 200);
    const { accessToken } = login.body.data;
    assert.equal((await request(allowed, { token: accessToken })).response.status, 200);
    if (account.role === Role.InventoryManager) {
      const receipt = await inventoryPost('receipts', { variantId: variant.id, quantity: 3, reason: 'Delivery' }, accessToken);
      assert.equal(receipt.response.status, 201);
      movement = receipt.body.data.movement;
    }

    const path = `${staffAccountsPath}/${account.id}`;
    const first = await adminRequest(path, admin, 'DELETE');
    assert.equal(first.response.status, 204);
    assert.equal(first.body, '');
    const inactive = await adminRequest(path, admin);
    assert.equal(inactive.body.data.id, account.id);
    assert.equal(inactive.body.data.isActive, false);
    const repeated = await adminRequest(path, admin, 'DELETE');
    assert.equal(repeated.response.status, 204);
    assert.equal(repeated.body, '');
    assert.deepEqual((await adminRequest(path, admin)).body, inactive.body);
    assertError(await loginManaged(account.email), 401);
    assertError(await request(allowed, { token: accessToken }), 401);
    assertError(await request('/auth/me', { token: accessToken }), 401);
  }
  const history = await request(`/inventory/movements?variantId=${variant.id}`, { token: admin });
  assert.equal(history.response.status, 200);
  assert.equal(history.body.meta.total, 1);
  assert.equal(movement.actorId, manager.id);
  assert.deepEqual(history.body.data, [movement]);
  assert.equal((await db.getRepository(InventoryMovement).findOneByOrFail({ id: movement.id })).actorId, manager.id);
  assert.equal((await db.getRepository(User).findOneByOrFail({ id: manager.id })).isActive, false);
  assert.equal((await db.getRepository(InventoryStock).findOneByOrFail({ variantId: variant.id })).quantity, 3);

  const reactivated = await adminRequest(`${staffAccountsPath}/${manager.id}`, admin, 'PATCH', { isActive: true });
  assert.equal(reactivated.response.status, 200);
  assert.equal(reactivated.body.data.isActive, true);
  assert.equal((await loginManaged(manager.email)).response.status, 200);
});

test('registration rejects null characters in a name as a field validation error', async () => {
  const submittedEmail = email('null-name');
  deleteAfter.push([User, { email: submittedEmail }]);
  const result = await request('/auth/register', {
    method: 'POST', body: { name: 'Sam\u0000Rahman', email: submittedEmail, password },
  });
  assertError(result, 400);
  assert.deepEqual(result.body.message, ['name must not contain a null character']);
  assert.equal(await db.getRepository(User).countBy({ email: submittedEmail }), 0);
});

test('signed expired and malformed JWTs are rejected on protected endpoints', async () => {
  const { user, token } = await createActor('expired-jwt', Role.Admin);
  const expired = await app.get(JwtService).signAsync({ sub: user.id }, { expiresIn: -60 });
  assert.equal((await request('/admin/access', { token })).response.status, 200);
  for (const rejected of [expired, 'malformed.jwt.token']) {
    assertError(await request('/admin/access', { token: rejected }), 401, 'Invalid or expired access token');
  }
});

test('seeded Admin, Staff, Inventory Manager, and Customer complete one purchase over HTTP', async () => {
  const adminEmail = email('defense-admin');
  const adminPassword = randomBytes(24).toString('base64url');
  const seed = promisify(execFile);
  const seedArgs = [require.resolve('../dist/modules/admin/seed-admin')];
  const seedEnv = { ...process.env, ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword };
  deleteAfter.push([User, { email: adminEmail }]);
  const firstSeed = await seed(process.execPath, seedArgs, { env: seedEnv });
  assert.match(firstSeed.stdout, /Admin account created/);
  const secondSeed = await seed(process.execPath, seedArgs, {
    env: { ...seedEnv, ADMIN_PASSWORD: randomBytes(24).toString('base64url') },
  });
  assert.match(secondSeed.stdout, /Admin account already exists/);
  assert.equal(await db.getRepository(User).countBy({ email: adminEmail, role: Role.Admin }), 1);

  const adminLogin = await request('/auth/login', {
    method: 'POST', body: { email: adminEmail, password: adminPassword },
  });
  assert.equal(adminLogin.response.status, 200);
  const admin = adminLogin.body.data.accessToken;
  assert.equal((await request('/admin/access', { token: admin })).response.status, 200);
  const staff = await createManagedAccount(admin, 'defense-staff', Role.Staff);
  const manager = await createManagedAccount(admin, 'defense-inventory', Role.InventoryManager);
  const managed = await adminRequest(staffAccountsPath + '?role=inventory_manager&isActive=true', admin);
  assert.equal(managed.response.status, 200);
  assert.ok(managed.body.data.some(({ id }) => id === manager.id));
  const managedPath = `${staffAccountsPath}/${staff.id}`;
  assert.equal((await adminRequest(managedPath, admin)).body.data.role, Role.Staff);
  const renamed = await adminRequest(managedPath, admin, 'PATCH', { name: 'Catalog Lead' });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.body.data.name, 'Catalog Lead');
  const disposable = await createManagedAccount(admin, 'defense-disposable', Role.Staff);
  assert.equal((await adminRequest(`${staffAccountsPath}/${disposable.id}`, admin, 'DELETE')).response.status, 204);
  assertError(await loginManaged(disposable.email), 401);
  const staffLogin = await loginManaged(staff.email);
  const inventoryLogin = await loginManaged(manager.email);
  assert.equal(staffLogin.response.status, 200);
  assert.equal(inventoryLogin.response.status, 200);
  const staffToken = staffLogin.body.data.accessToken;
  const inventoryToken = inventoryLogin.body.data.accessToken;

  const category = await createStaffRecord('categories', Category, {
    name: 'T-Shirts', slug: catalogLabel('defense-shirts'),
  }, staffToken);
  const collection = await createStaffRecord('collections', Collection, {
    name: 'Essential Cotton', slug: catalogLabel('defense-essentials'),
  }, staffToken);
  const product = await createStaffRecord('products', Product, {
    name: 'THREAD Essential Cotton T-Shirt', slug: catalogLabel('defense-tee'),
    categoryId: category.id, collectionIds: [collection.id], isActive: false,
  }, staffToken);
  const variant = await createStaffRecord('variants', ProductVariant, {
    productId: product.id, sku: catalogLabel('DEFENSE-COTTON-BLK-M'),
    size: 'M', color: 'Black', priceMinor: 120000, isActive: false,
  }, staffToken);
  const productPath = `/products/${product.id}`;
  assertError(await request(productPath), 404);
  const publish = await staffRequest(productPath, staffToken, 'PATCH', { isActive: true });
  assert.equal(publish.response.status, 200);
  assert.deepEqual(publish.body.data.collectionIds, [collection.id]);
  assert.equal((await staffRequest(`/variants/${variant.id}`, staffToken, 'PATCH', { isActive: true })).response.status, 200);
  const catalog = await request(`/products?categoryId=${category.id}&limit=1`);
  assert.equal(catalog.response.status, 200);
  assert.equal(catalog.body.meta.total, 1);
  const details = await request(productPath);
  assert.deepEqual(details.body.data, catalog.body.data[0]);
  assert.deepEqual(details.body.data.variants, [
    { id: variant.id, sku: variant.sku, size: 'M', color: 'Black', priceMinor: 120000 },
  ]);

  cleanInventory(variant.id);
  const stockPath = `/inventory/stock/${variant.id}`;
  const zero = await request(stockPath, { token: inventoryToken });
  assert.equal(zero.response.status, 200);
  assert.equal(zero.body.data.quantity, 0);
  const receive = await inventoryPost('receipts', {
    variantId: variant.id, quantity: 10, reason: 'Opening demonstration delivery',
  }, inventoryToken);
  assert.equal(receive.response.status, 201);
  assert.equal(receive.body.data.quantity, 10);
  assert.equal(receive.body.data.movement.actorId, manager.id);
  const adjustment = await inventoryPost('adjustments', {
    variantId: variant.id, delta: -1, reason: 'One damaged unit',
  }, inventoryToken);
  assert.equal(adjustment.response.status, 201);
  assert.equal(adjustment.body.data.quantity, 9);

  const customerEmail = email('defense-customer');
  const registration = await request('/auth/register', {
    method: 'POST', body: { name: 'Demo Customer', email: customerEmail, password },
  });
  assert.equal(registration.response.status, 201);
  const buyer = registration.body.data.user;
  deleteAfter.push([User, buyer.id], [Order, { userId: buyer.id }], [InventoryMovement, { actorId: buyer.id }]);
  assert.equal(buyer.role, Role.Customer);
  const session = await loginManaged(customerEmail);
  assert.equal(session.response.status, 200);
  const token = session.body.data.accessToken;
  const profile = await request('/customers/me', { method: 'PATCH', token, body: { name: 'Demo Buyer' } });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.data.name, 'Demo Buyer');
  const address = await request('/addresses', { method: 'POST', body: addressInput, token });
  assert.equal(address.response.status, 201);
  const addressId = address.body.data.id;
  const addressPath = `/addresses/${addressId}`;
  assert.equal((await request('/addresses', { token })).body.data[0].id, addressId);
  assert.equal((await request(addressPath, { token })).response.status, 200);
  const updatedAddress = await request(addressPath, { method: 'PATCH', body: { line2: 'Flat 2A' }, token });
  assert.equal(updatedAddress.response.status, 200);
  const { token: stranger } = await createActor('defense-other');
  assertError(await request(addressPath, { token: stranger }), 404);

  const initialCart = await setCartItem(variant.id, 1, token);
  assert.equal(initialCart.response.status, 200);
  assert.equal(initialCart.body.data.totalMinor, 120000);
  const changedCart = await setCartItem(variant.id, 2, token);
  assert.equal(changedCart.response.status, 200);
  const cart = await request('/cart', { token });
  assert.equal(cart.body.data.items[0].quantity, 2);
  assert.equal(cart.body.data.totalMinor, 240000);

  const placement = await checkout(addressId, token);
  assert.equal(placement.response.status, 201);
  assert.match(placement.response.headers.get('x-response-time'), /^\d+\.\d{2}ms$/);
  const order = placement.body.data;
  assert.equal(order.totalMinor, 240000);
  assert.deepEqual(order.shippingAddress, { ...addressInput, line2: 'Flat 2A' });
  const [item] = order.items;
  assert.deepEqual(item, {
    id: item.id, variantId: variant.id, sku: variant.sku, productName: product.name,
    quantity: 2, unitPriceMinor: 120000, size: 'M', color: 'Black',
  });
  assert.deepEqual((await request('/cart', { token })).body.data.items, []);
  assert.equal((await request(stockPath, { token: inventoryToken })).body.data.quantity, 7);
  const inventoryHistory = await request(`/inventory/movements?variantId=${variant.id}&page=1&limit=2`, {
    token: inventoryToken,
  });
  assert.equal(inventoryHistory.response.status, 200);
  assert.deepEqual(inventoryHistory.body.meta, { page: 1, limit: 2, total: 3 });
  const [sale] = inventoryHistory.body.data;
  assert.equal(sale.type, MovementType.Sale);
  assert.equal(sale.actorId, buyer.id);
  assert.equal(sale.delta, -2);
  assert.equal(sale.reason, `Order ${order.id}`);
  assert.equal((await db.getRepository(Order).findOneByOrFail({ id: order.id })).userId, buyer.id);
  assert.equal(await db.getRepository(OrderItem).countBy({ orderId: order.id, variantId: variant.id }), 1);
  const history = await request('/orders?page=1&limit=1', { token });
  assert.deepEqual(history.body.meta, { page: 1, limit: 1, total: 1 });
  assert.equal(history.body.data[0].id, order.id);
  const orderPath = `/orders/${order.id}`;
  assert.deepEqual((await request(orderPath, { token })).body.data, order);
  assertError(await request(orderPath, { token: stranger }), 404);
});

test('Fulfillment and Shipments Swagger describe all operations, request bodies, and schemas', async () => {
  const { response, body: doc } = await request('/docs-json');
  assert.equal(response.status, 200);
  for (const [path, method, success, tag] of [
    ['/api/fulfillment/orders', 'get', 200, 'Fulfillment'],
    ['/api/fulfillment/orders/{id}/pack', 'patch', 200, 'Fulfillment'],
    ['/api/fulfillment/orders/{id}/shipments', 'post', 201, 'Fulfillment'],
    ['/api/shipments/order/{orderId}', 'get', 200, 'Shipments'],
    ['/api/shipments/tracking/{trackingNumber}', 'get', 200, 'Shipments'],
  ]) {
    const operation = doc.paths[path][method];
    assert.deepEqual(operation.tags, [tag]);
    assert.deepEqual(operation.security, [{ bearer: [] }]);
    for (const status of [success, 401, 403]) assert.ok(operation.responses[status]);
  }

  const post = doc.paths['/api/fulfillment/orders/{id}/shipments'].post;
  assert.equal(post.requestBody.content['application/json'].schema.$ref, '#/components/schemas/CreateShipmentDto');
  const schema = doc.components.schemas.CreateShipmentDto;
  assert.deepEqual(schema.required, ['carrier']);
  assert.ok(post.responses[404]);
  assert.ok(post.responses[409]);
});

test('Fulfillment endpoints enforce the role matrix and reject unauthorized callers', async () => {
  const { token: customer } = await createActor('fulfillment-denied-customer');
  const { token: staff } = await createActor('fulfillment-denied-staff', Role.Staff);
  const { token: inventory } = await createActor('fulfillment-allowed-inv', Role.InventoryManager);
  const { token: admin } = await createActor('fulfillment-allowed-admin', Role.Admin);

  assertError(await request('/fulfillment/orders'), 401);
  assertError(await request('/fulfillment/orders', { token: customer }), 403);
  assertError(await request('/fulfillment/orders', { token: staff }), 403);
  assert.equal((await request('/fulfillment/orders', { token: inventory })).response.status, 200);
  assert.equal((await request('/fulfillment/orders', { token: admin })).response.status, 200);
});

test('Inventory Manager can pack and ship an order, generating traceable shipments', async () => {
  const { variants: [variant] } = await createCatalog('fulfillment-test');
  const { token: customerToken, address } = await createBuyer('fulfillment-buyer');
  const { token: inventoryToken } = await createActor('fulfillment-manager', Role.InventoryManager);
  const { token: strangerToken } = await createActor('fulfillment-stranger');

  await insert(InventoryStock, { variantId: variant.id, quantity: 10 });
  await setCartItem(variant.id, 1, customerToken);
  const placed = await checkout(address.id, customerToken);
  assert.equal(placed.response.status, 201);
  const orderId = placed.body.data.id;
  deleteAfter.push([Shipment, { orderId }]);

  const list = await request('/fulfillment/orders', { token: inventoryToken });
  assert.equal(list.response.status, 200);
  const orderInList = list.body.data.find((o) => o.id === orderId);
  assert.ok(orderInList);
  assert.equal(orderInList.status, OrderStatus.Placed);

  const packed = await request(`/fulfillment/orders/${orderId}/pack`, { method: 'PATCH', token: inventoryToken });
  assert.equal(packed.response.status, 200);
  assert.equal(packed.body.data.status, OrderStatus.Processing);

  const rePacked = await request(`/fulfillment/orders/${orderId}/pack`, { method: 'PATCH', token: inventoryToken });
  assert.equal(rePacked.response.status, 200);
  assert.equal(rePacked.body.data.status, OrderStatus.Processing);

  const trackingNumber = `TRK-${randomUUID().slice(0, 8).toUpperCase()}`;
  const shipped = await request(`/fulfillment/orders/${orderId}/shipments`, {
    method: 'POST',
    token: inventoryToken,
    body: { carrier: 'Pathao', trackingNumber },
  });
  assert.equal(shipped.response.status, 201);
  assert.equal(shipped.body.data.orderId, orderId);
  assert.equal(shipped.body.data.carrier, 'Pathao');
  assert.equal(shipped.body.data.trackingNumber, trackingNumber);
  assert.equal(shipped.body.data.status, ShipmentStatus.InTransit);

  const duplicate = await request(`/fulfillment/orders/${orderId}/shipments`, {
    method: 'POST',
    token: inventoryToken,
    body: { carrier: 'DHL', trackingNumber: `TRK-DUP-${randomUUID().slice(0, 4)}` },
  });
  assertError(duplicate, 409);

  const packAfterShip = await request(`/fulfillment/orders/${orderId}/pack`, { method: 'PATCH', token: inventoryToken });
  assertError(packAfterShip, 409);

  const customerTracking = await request(`/shipments/order/${orderId}`, { token: customerToken });
  assert.equal(customerTracking.response.status, 200);
  assert.equal(customerTracking.body.data.trackingNumber, trackingNumber);

  const strangerTracking = await request(`/shipments/order/${orderId}`, { token: strangerToken });
  assertError(strangerTracking, 404);

  const publicTracking = await request(`/shipments/tracking/${trackingNumber}`, { token: customerToken });
  assert.equal(publicTracking.response.status, 200);
  assert.equal(publicTracking.body.data.trackingNumber, trackingNumber);
  assert.equal(publicTracking.body.data.orderId, orderId);

  const missingTracking = await request('/shipments/tracking/NONEXISTENT_TRACKING_NO', { token: customerToken });
  assertError(missingTracking, 404);
});

test('OpenAPI exposes all 55 registered application operations', async () => {
  const result = await request('/docs-json');
  assert.equal(result.response.status, 200);
  const paths = Object.entries(result.body.paths);
  const count = (prefix) => paths.filter(([path]) => path.startsWith(prefix))
    .reduce((total, [, operations]) => total + Object.keys(operations).length, 0);
  assert.deepEqual([
    count('/api/admin'), count('/api/staff'), count('/api/inventory'), count('/api/products'),
    count('/api/auth'), count('/api/health'), count('/api/fulfillment'), count('/api/shipments'),
  ], [6, 20, 5, 2, 3, 1, 3, 2]);
  assert.equal(paths.reduce((total, [, operations]) => total + Object.keys(operations).length, 0), 55);
});
