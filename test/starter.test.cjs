const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
require('reflect-metadata');

const { Logger, ValidationPipe } = require('@nestjs/common');
const { validateAppEnvironment } = require('../dist/config/environment');
const { RegisterDto } = require('../dist/modules/auth/auth.dto');
const { hashPassword, verifyPassword } = require('../dist/modules/auth/password');
const {
  CreateAddressDto, SetCartItemDto, UpdateAddressDto, UpdateProfileDto,
} = require('../dist/modules/customer/customer.dto');
const { Page, PageQueryDto } = require('../dist/common/http/pagination');
const { requestLogging } = require('../dist/common/http/request-logging');

const env = {
  DB_NAME: 'minimal_thread_test',
  DB_USER: 'thread_test',
  DB_PASSWORD: 'test-value',
  JWT_SECRET: 'unit-test-secret-with-at-least-32-chars',
};
const pipe = new ValidationPipe({
  transform: true, whitelist: true, forbidNonWhitelisted: true,
});

const transform = (metatype, data, type = 'body') => pipe.transform(data, { metatype, type });

test('request logging emits one entry only after the response finishes', (t) => {
  const log = t.mock.method(Logger.prototype, 'log', () => {});
  const request = { method: 'DELETE', requestId: 'existing-request-id' };
  const response = new EventEmitter();

  let continued = false;
  requestLogging(request, response, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(log.mock.callCount(), 0);

  request.route = { path: '/api/addresses/:id' };
  response.statusCode = 204;
  response.emit('finish');
  response.emit('finish');
  assert.equal(log.mock.callCount(), 1);
  assert.match(
    log.mock.calls[0].arguments[0],
    /^DELETE \/api\/addresses\/:id 204 \d+\.\d{2}ms requestId=existing-request-id$/,
  );
});

test('validates and converts environment variables', () => {
  const values = validateAppEnvironment({ ...env, PORT: '3010', JWT_TTL_SECONDS: '600' });
  assert.equal(values.PORT, 3010);
  assert.equal(values.JWT_TTL_SECONDS, 600);
  assert.equal(values.DB_PORT, 5433);
  assert.throws(() => validateAppEnvironment({ ...env, JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.throws(() => validateAppEnvironment({ ...env, DB_PORT: '70000' }), /DB_PORT/);
});

test('registration DTO normalizes email and rejects privileged fields', async () => {
  const input = { email: ' SAM@example.com ', password: 'a-valid-test-password', name: ' Sam ' };
  const data = await transform(RegisterDto, input);
  assert.equal(data.email, 'sam@example.com');
  assert.equal(data.name, 'Sam');
  await assert.rejects(transform(RegisterDto, { ...input, role: 'admin' }));
  await assert.rejects(transform(RegisterDto, { ...input, email: 'invalid' }));
  await assert.rejects(transform(RegisterDto, { ...input, password: 'é'.repeat(37) }));
});

test('address create requires its fields and update accepts partial values', async () => {
  await assert.rejects(transform(CreateAddressDto, { city: 'Dhaka' }));
  const data = await transform(UpdateAddressDto, { city: 'Dhaka', line2: null });
  assert.equal(data.city, 'Dhaka');
  assert.equal(data.line2, null);
  await assert.rejects(transform(UpdateAddressDto, { city: null }));
});

test('profile DTO trims the name and rejects invalid names and unexpected fields', async () => {
  const data = await transform(UpdateProfileDto, { name: ' Sam ' });
  assert.equal(data.name, 'Sam');
  for (const input of [{}, { name: ' ' }, { name: null }, { name: 'X'.repeat(101) }]) {
    await assert.rejects(transform(UpdateProfileDto, input));
  }
  await assert.rejects(transform(UpdateProfileDto, { name: 'Sam', role: 'admin' }));
});

test('pagination converts query values, caps page size, and keeps total', async () => {
  const query = await transform(PageQueryDto, { page: '2', limit: '10' }, 'query');
  assert.deepEqual(new Page(['a'], 15, query).meta, { page: 2, limit: 10, total: 15 });
  await assert.rejects(transform(PageQueryDto, { limit: '101' }, 'query'));
});

test('cart quantity accepts integers from 1 to 1000 without coercing strings', async () => {
  for (const quantity of [1, 1000]) {
    assert.equal((await transform(SetCartItemDto, { quantity })).quantity, quantity);
  }
  for (const quantity of [0, -1, 1.5, '2', 1001, null, undefined]) {
    await assert.rejects(transform(SetCartItemDto, { quantity }));
  }
});

test('bcrypt hashes passwords and rejects input beyond its UTF-8 limit', async () => {
  const password = 'valid-password';
  const digest = await hashPassword(password);
  assert.match(digest, /^\$2[ab]\$12\$/);
  assert.equal(await verifyPassword(password, digest), true);
  assert.equal(await verifyPassword('wrong-password', digest), false);
  assert.throws(() => hashPassword('é'.repeat(37)), /72 UTF-8 bytes/);
});
