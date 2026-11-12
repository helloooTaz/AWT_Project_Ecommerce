import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import { Address } from '../../src/modules/addresses/entities/address.entity';
import { UserRole } from '../../src/modules/roles/user-role.enum';
import { User, UserStatus } from '../../src/modules/users/entities/user.entity';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;
const base = '/api/v1';
const addresses = `${base}/me/addresses`;
const password = 'test-address-passphrase';
const address = {
  recipient: 'Samira Rahman',
  phone: '+8801712345678',
  addressLine1: 'House 12, Road 5',
  addressLine2: 'Apartment 3B',
  city: 'Dhaka',
};

interface Account {
  id: string;
  email: string;
  token: string;
}

describeWithPostgres(
  'Delivery addresses with PostgreSQL and bearer JWT',
  () => {
    let app: INestApplication<Server>;
    let db: DataSource;
    let customer: Account;
    let otherCustomer: Account;
    let staff: Account;
    const userIds: string[] = [];
    const jwtSecret = randomBytes(32).toString('hex');

    function api() {
      return request(app.getHttpServer());
    }

    async function registerCustomer(): Promise<Account> {
      const email = `address-test-${randomUUID()}@example.com`;
      const registration = await api()
        .post(`${base}/auth/register`)
        .send({ email, fullName: 'Customer Test', password })
        .expect(201);
      const { id } = (registration.body as { data: { id: string } }).data;
      userIds.push(id);
      expect(registration.body).toMatchObject({
        data: { id, email, fullName: 'Customer Test', role: 'CUSTOMER' },
      });
      expect(registration.body).not.toHaveProperty('data.passwordHash');
      expect(registration.body).not.toHaveProperty('data.password');

      const login = await api()
        .post(`${base}/auth/login`)
        .send({ email, password })
        .expect(200);
      const { accessToken } = (login.body as { data: { accessToken: string } })
        .data;
      return { id, email, token: `Bearer ${accessToken}` };
    }

    async function addAddress(
      owner: Account,
      input = address,
    ): Promise<string> {
      const response = await api()
        .post(addresses)
        .set('Authorization', owner.token)
        .send(input)
        .expect(201);
      return (response.body as { data: { id: string } }).data.id;
    }

    beforeAll(async () => {
      jest.replaceProperty(process, 'env', {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        JWT_SECRET: jwtSecret,
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
          'Apply migrations to TEST_DATABASE_URL before running address tests',
        );
      }

      customer = await registerCustomer();
      otherCustomer = await registerCustomer();
      staff = await registerCustomer();
      await db.getRepository(User).update(staff.id, { role: UserRole.STAFF });
    }, 20000);

    afterEach(async () => {
      if (db && userIds.length) {
        await db.getRepository(Address).delete({ userId: In(userIds) });
      }
    });

    afterAll(async () => {
      try {
        if (db && userIds.length) {
          await db.getRepository(Address).delete({ userId: In(userIds) });
          await db.getRepository(User).delete({ id: In(userIds) });
        }
      } finally {
        await app?.close();
        jest.restoreAllMocks();
      }
    });

    it('creates, reads, partially updates, clears an optional line and deletes an address', async () => {
      const id = await addAddress(customer);
      const read = await api()
        .get(`${addresses}/${id}`)
        .set('Authorization', customer.token)
        .expect(200);
      expect(read.body).toMatchObject({
        success: true,
        data: { id, ...address },
      });
      expect(read.body).toHaveProperty('data.createdAt');
      expect(read.body).not.toHaveProperty('data.userId');
      expect(read.body).not.toHaveProperty('data.user');

      const update = await api()
        .patch(`${addresses}/${id}`)
        .set('Authorization', customer.token)
        .send({ city: '  Chattogram  ', addressLine2: null })
        .expect(200);
      expect(update.body).toMatchObject({
        data: { id, ...address, city: 'Chattogram', addressLine2: null },
      });

      const deletion = await api()
        .delete(`${addresses}/${id}`)
        .set('Authorization', customer.token)
        .expect(204);
      expect(deletion.text).toBe('');
      await api()
        .get(`${addresses}/${id}`)
        .set('Authorization', customer.token)
        .expect(404);
    });

    it('lists only the caller’s addresses with default and explicit pagination', async () => {
      const empty = await api()
        .get(addresses)
        .set('Authorization', customer.token)
        .expect(200);
      expect(empty.body).toMatchObject({
        data: [],
        meta: { pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
      });
      const first = await addAddress(customer);
      const second = await addAddress(customer, { ...address, city: 'Sylhet' });
      await addAddress(otherCustomer);

      const page1 = await api()
        .get(`${addresses}?limit=1`)
        .set('Authorization', customer.token)
        .expect(200);
      const page2 = await api()
        .get(`${addresses}?page=2&limit=1`)
        .set('Authorization', customer.token)
        .expect(200);
      expect(page1.body).toMatchObject({
        data: [{ id: second }],
        meta: { pagination: { page: 1, limit: 1, total: 2, totalPages: 2 } },
      });
      expect(page2.body).toMatchObject({
        data: [{ id: first }],
        meta: { pagination: { page: 2, limit: 1, total: 2, totalPages: 2 } },
      });
    });

    it('hides other customers’ addresses for read, update and delete', async () => {
      const id = await addAddress(otherCustomer);
      const path = `${addresses}/${id}`;
      const read = await api()
        .get(path)
        .set('Authorization', customer.token)
        .expect(404);
      expect(read.body).toMatchObject({
        success: false,
        message: 'Address not found',
        error: { code: 'NOT_FOUND' },
      });
      await api()
        .patch(path)
        .set('Authorization', customer.token)
        .send({ city: 'Sylhet' })
        .expect(404);
      await api().delete(path).set('Authorization', customer.token).expect(404);
      const ownerRead = await api()
        .get(path)
        .set('Authorization', otherCustomer.token)
        .expect(200);
      expect(ownerRead.body).toMatchObject({ data: { city: address.city } });
    });

    it('validates address bodies, UUIDs and pagination', async () => {
      const invalid = await api()
        .post(addresses)
        .set('Authorization', customer.token)
        .send({
          ...address,
          recipient: '  ',
          phone: '123',
          userId: otherCustomer.id,
        })
        .expect(400);
      expect(invalid.body).toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(invalid.body).toHaveProperty(
        'error.details',
        expect.arrayContaining([
          expect.objectContaining({ field: 'recipient' }),
          expect.objectContaining({ field: 'phone' }),
          expect.objectContaining({ field: 'userId' }),
        ]),
      );
      await api()
        .get(`${addresses}/invalid`)
        .set('Authorization', customer.token)
        .expect(400);
      await api()
        .get(`${addresses}?page=0&limit=101`)
        .set('Authorization', customer.token)
        .expect(400);
      const path = `${addresses}/${await addAddress(customer)}`;
      await api()
        .patch(path)
        .set('Authorization', customer.token)
        .send({ city: null })
        .expect(400);
      await api()
        .patch(path)
        .set('Authorization', customer.token)
        .send({ city: 'Dhaka\0' })
        .expect(400);
      await api()
        .patch(path)
        .set('Authorization', customer.token)
        .send([{ city: 'Dhaka' }])
        .expect(400);
      await api()
        .patch(path)
        .set('Authorization', customer.token)
        .send({})
        .expect(400);
    });

    it('rejects missing, invalid and expired tokens and uses the current account role', async () => {
      await api().get(addresses).expect(401);
      await api()
        .get(addresses)
        .set('Authorization', 'Bearer malformed')
        .expect(401);
      const expiredToken = new JwtService({ secret: jwtSecret }).sign(
        { sub: customer.id },
        { expiresIn: -1 },
      );
      await api()
        .get(addresses)
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
      await api().get(addresses).set('Authorization', staff.token).expect(403);

      await db
        .getRepository(User)
        .update(staff.id, { status: UserStatus.INACTIVE });
      await api().get(addresses).set('Authorization', staff.token).expect(401);
    });

    it('rejects privileged registration and duplicate emails and protects credentials', async () => {
      const registration = {
        email: customer.email.toUpperCase(),
        fullName: 'Customer Test',
        password,
      };
      await api()
        .post(`${base}/auth/register`)
        .send({ ...registration, role: 'ADMIN' })
        .expect(400);
      await api()
        .post(`${base}/auth/register`)
        .send({ ...registration, password: 'ü'.repeat(37) })
        .expect(400);
      await api().post(`${base}/auth/register`).send(registration).expect(409);
      await api()
        .post(`${base}/auth/login`)
        .send({ email: customer.email, password: 'incorrect-password' })
        .expect(401);
      const user = await db
        .getRepository(User)
        .findOneByOrFail({ id: customer.id });
      expect(user.passwordHash).toBeUndefined();
      const stored = await db.getRepository(User).findOneOrFail({
        where: { id: customer.id },
        select: { id: true, passwordHash: true },
      });
      expect(stored.passwordHash).toMatch(/^\$2b\$/);
    });

    it('documents the protected address routes in OpenAPI', async () => {
      const docs = await api().get('/api/docs-json').expect(200);
      expect(docs.body).toHaveProperty(
        ['paths', addresses, 'post', 'security'],
        [{ bearer: [] }],
      );
      expect(docs.body).toHaveProperty([
        'paths',
        `${addresses}/{id}`,
        'delete',
        'responses',
        '204',
      ]);
    });
  },
);
