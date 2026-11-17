import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, In, Repository } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import { UserRole } from '../../src/modules/roles/user-role.enum';
import { User, UserStatus } from '../../src/modules/users/entities/user.entity';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;
const path = '/api/v1/users/me';

describeWithPostgres('Profile update with PostgreSQL and bearer JWT', () => {
  let app: INestApplication<Server>;
  let users: Repository<User>;
  let owner: { id: string; token: string };
  let other: { id: string; token: string };
  const userIds: string[] = [];
  const jwtSecret = randomBytes(32).toString('hex');

  function api() {
    return request(app.getHttpServer());
  }

  async function registerAndLogin() {
    const email = `profile-test-${randomUUID()}@example.com`;
    const password = 'test-profile-passphrase';
    const registration = await api()
      .post('/api/v1/auth/register')
      .send({ email, fullName: 'Initial Name', password })
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
    const db = app.get(DataSource);
    if (await db.showMigrations()) {
      throw new Error(
        'Apply migrations to TEST_DATABASE_URL before running profile tests',
      );
    }
    users = db.getRepository(User);
    owner = await registerAndLogin();
    other = await registerAndLogin();
  }, 20000);

  afterAll(async () => {
    try {
      if (users && userIds.length) {
        await users.delete({ id: In(userIds) });
      }
    } finally {
      await app?.close();
      jest.restoreAllMocks();
    }
  });

  it('persists the trimmed name and returns only safe profile fields', async () => {
    const before = await users.findOneByOrFail({ id: owner.id });
    const fullName = 'Samira Rahman';
    const response = await api()
      .patch(path)
      .set('Authorization', owner.token)
      .send({ fullName: `  ${fullName}  ` })
      .expect(200);

    const requestId: unknown = expect.any(String);
    expect(response.body).toEqual({
      success: true,
      message: 'OK',
      data: { id: owner.id, fullName },
      meta: { requestId },
    });
    const saved = await users.findOneByOrFail({ id: owner.id });
    expect(saved).toEqual({ ...before, fullName, updatedAt: saved.updatedAt });
  });

  it.each([UserRole.STAFF, UserRole.INVENTORY_MANAGER, UserRole.ADMIN])(
    'allows an active %s account to update its own name',
    async (role) => {
      await users.update(other.id, { role });
      const fullName = 'Updated Name';
      await api()
        .patch(path)
        .set('Authorization', other.token)
        .send({ fullName })
        .expect(200);
      expect(await users.findOneByOrFail({ id: other.id })).toMatchObject({
        role,
        fullName,
      });
    },
  );

  it('returns 401 for missing credentials and inactive or nonexistent accounts', async () => {
    const body = { fullName: 'Updated Name' };
    await api().patch(path).send(body).expect(401);

    await users.update(other.id, { status: UserStatus.INACTIVE });
    try {
      await api()
        .patch(path)
        .set('Authorization', other.token)
        .send(body)
        .expect(401);
    } finally {
      await users.update(other.id, { status: UserStatus.ACTIVE });
    }

    const token = new JwtService({ secret: jwtSecret }).sign({
      sub: randomUUID(),
    });
    await api()
      .patch(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(401);
  });

  it.each([
    ['omitted', {}],
    ['empty', { fullName: '' }],
    ['whitespace only', { fullName: ' \t ' }],
    ['null', { fullName: null }],
    ['non-string', { fullName: 123 }],
    ['over 120 characters', { fullName: 'a'.repeat(121) }],
    ['contains a null character', { fullName: 'Samira\0Rahman' }],
  ])('rejects a name that is %s', async (_description, body) => {
    const response = await api()
      .patch(path)
      .set('Authorization', owner.token)
      .send(body)
      .expect(400);
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(response.body).toHaveProperty(
      'error.details',
      expect.arrayContaining([expect.objectContaining({ field: 'fullName' })]),
    );
  });

  it('rejects restricted fields and prevents targeting another account', async () => {
    const ownerBefore = await users.findOneByOrFail({ id: owner.id });
    const otherBefore = await users.findOneByOrFail({ id: other.id });
    const restrictedFields = {
      id: other.id,
      userId: other.id,
      role: UserRole.ADMIN,
      status: UserStatus.INACTIVE,
      email: 'changed@example.com',
      password: 'changed-password',
      passwordHash: 'changed-hash',
    };

    const response = await api()
      .patch(path)
      .set('Authorization', owner.token)
      .send({ fullName: 'Changed Name', ...restrictedFields })
      .expect(400);
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(response.body).toHaveProperty(
      'error.details',
      expect.arrayContaining(
        Object.keys(restrictedFields).map((field): unknown =>
          expect.objectContaining({ field }),
        ),
      ),
    );
    expect(await users.findOneByOrFail({ id: owner.id })).toEqual(ownerBefore);
    expect(await users.findOneByOrFail({ id: other.id })).toEqual(otherBefore);
  });

  it('documents the bearer token requirement and profile DTO in Swagger', async () => {
    const docs = await api().get('/api/docs-json').expect(200);
    expect(docs.body).toHaveProperty(
      ['paths', path, 'patch', 'security'],
      [{ bearer: [] }],
    );
    expect(docs.body).toHaveProperty(
      ['components', 'schemas', 'UpdateProfileDto', 'properties', 'fullName'],
      expect.objectContaining({ type: 'string', maxLength: 120 }),
    );
  });
});
