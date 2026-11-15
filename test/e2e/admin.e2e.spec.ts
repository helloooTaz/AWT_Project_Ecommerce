import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, In, Repository } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import { AuditLog } from '../../src/modules/audit/entities/audit-log.entity';
import { UserRole } from '../../src/modules/roles/user-role.enum';
import { User, UserStatus } from '../../src/modules/users/entities/user.entity';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;

interface ApiEnvelope<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  meta: {
    requestId: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

interface UserData {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
}

interface AnalyticsData {
  users: { total: number };
  audit: { totalLogs: number };
}

describeWithPostgres(
  'Admin & Staff Management with PostgreSQL and RBAC',
  () => {
    let app: INestApplication<Server>;
    let users: Repository<User>;
    let auditLogs: Repository<AuditLog>;
    let admin: { id: string; token: string };
    let customer: { id: string; token: string };
    const userIds: string[] = [];
    const jwtSecret = randomBytes(32).toString('hex');

    function api() {
      return request(app.getHttpServer());
    }

    async function registerAndLogin(role = UserRole.CUSTOMER) {
      const email = `admin-test-${randomUUID()}@example.com`;
      const password = 'test-admin-passphrase';
      const registration = await api()
        .post('/api/v1/auth/register')
        .send({ email, fullName: 'Test User', password })
        .expect(201);
      const regBody = registration.body as ApiEnvelope<{ id: string }>;
      const id = regBody.data.id;
      userIds.push(id);

      if (role !== UserRole.CUSTOMER) {
        await users.update({ id }, { role });
      }

      const login = await api()
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const loginBody = login.body as ApiEnvelope<{ accessToken: string }>;
      return { id, token: `Bearer ${loginBody.data.accessToken}` };
    }

    beforeAll(async () => {
      jest.replaceProperty(process, 'env', {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        JWT_SECRET: jwtSecret,
        NODE_ENV: 'test',
      });

      const { AppModule } = await import('../../src/app.module');
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleRef.createNestApplication();
      configureApp(app, false);
      await app.init();

      const dataSource = app.get(DataSource);
      users = dataSource.getRepository(User);
      auditLogs = dataSource.getRepository(AuditLog);

      admin = await registerAndLogin(UserRole.ADMIN);
      customer = await registerAndLogin(UserRole.CUSTOMER);
    });

    afterAll(async () => {
      if (users && userIds.length > 0) {
        await users.delete({ id: In(userIds) });
      }
      if (app) {
        await app.close();
      }
    });

    describe('Security and Access Control', () => {
      it('rejects unauthenticated requests with 401', async () => {
        await api().get('/api/v1/admin/staff').expect(401);
        await api().get('/api/v1/admin/audit-logs').expect(401);
        await api().get('/api/v1/admin/analytics/summary').expect(401);
      });

      it('rejects customer requests with 403 Forbidden', async () => {
        await api()
          .get('/api/v1/admin/staff')
          .set('Authorization', customer.token)
          .expect(403);

        await api()
          .get('/api/v1/admin/audit-logs')
          .set('Authorization', customer.token)
          .expect(403);

        await api()
          .get('/api/v1/admin/analytics/summary')
          .set('Authorization', customer.token)
          .expect(403);
      });

      it('allows any authenticated user to view their own profile via GET /users/me', async () => {
        const res = await api()
          .get('/api/v1/users/me')
          .set('Authorization', customer.token)
          .expect(200);

        const body = res.body as ApiEnvelope<UserData>;
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(customer.id);
        expect(body.data.role).toBe(UserRole.CUSTOMER);
      });
    });

    describe('Staff Lifecycle and Audit Trail', () => {
      let createdStaffId: string;
      const staffEmail = `staff-${randomUUID()}@example.com`;

      it('creates a new staff member and writes an audit log in a transaction', async () => {
        const res = await api()
          .post('/api/v1/admin/staff')
          .set('Authorization', admin.token)
          .send({
            email: staffEmail,
            fullName: 'Warehouse Supervisor',
            password: 'staffPass1234!',
            role: UserRole.STAFF,
          })
          .expect(201);

        const body = res.body as ApiEnvelope<UserData>;
        expect(body.success).toBe(true);
        expect(body.data.email).toBe(staffEmail.toLowerCase());
        expect(body.data.role).toBe(UserRole.STAFF);
        expect(body.data.status).toBe(UserStatus.ACTIVE);
        createdStaffId = body.data.id;
        userIds.push(createdStaffId);

        // Verify audit log creation
        const log = await auditLogs.findOne({
          where: { action: 'STAFF_CREATED', entityId: createdStaffId },
        });
        expect(log).toBeDefined();
        expect(log?.actorId).toBe(admin.id);
      });

      it('rejects duplicate staff email with 409 Conflict', async () => {
        await api()
          .post('/api/v1/admin/staff')
          .set('Authorization', admin.token)
          .send({
            email: staffEmail,
            fullName: 'Duplicate Staff',
            password: 'staffPass1234!',
            role: UserRole.STAFF,
          })
          .expect(409);
      });

      it('rejects invalid staff creation with 400 Validation Error', async () => {
        const res = await api()
          .post('/api/v1/admin/staff')
          .set('Authorization', admin.token)
          .send({
            email: 'not-an-email',
            fullName: '',
            password: 'short',
            role: 'INVALID_ROLE',
          })
          .expect(400);

        const body = res.body as ApiEnvelope;
        expect(body.success).toBe(false);
        expect(body.error?.code).toBe('VALIDATION_ERROR');
      });

      it('lists staff members with pagination', async () => {
        const res = await api()
          .get('/api/v1/admin/staff?page=1&limit=10')
          .set('Authorization', admin.token)
          .expect(200);

        const body = res.body as ApiEnvelope<UserData[]>;
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.meta.pagination?.page).toBe(1);
      });

      it('gets staff detail by ID', async () => {
        const res = await api()
          .get(`/api/v1/admin/staff/${createdStaffId}`)
          .set('Authorization', admin.token)
          .expect(200);

        const body = res.body as ApiEnvelope<UserData>;
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(createdStaffId);
      });

      it('updates staff member profile and writes audit log', async () => {
        const res = await api()
          .patch(`/api/v1/admin/staff/${createdStaffId}`)
          .set('Authorization', admin.token)
          .send({
            fullName: 'Senior Inventory Manager',
            role: UserRole.INVENTORY_MANAGER,
          })
          .expect(200);

        const body = res.body as ApiEnvelope<UserData>;
        expect(body.success).toBe(true);
        expect(body.data.fullName).toBe('Senior Inventory Manager');
        expect(body.data.role).toBe(UserRole.INVENTORY_MANAGER);

        // Verify audit log
        const log = await auditLogs.findOne({
          where: { action: 'STAFF_UPDATED', entityId: createdStaffId },
        });
        expect(log).toBeDefined();
        const afterState = log?.after as Record<string, unknown> | undefined;
        expect(afterState?.fullName).toBe('Senior Inventory Manager');
      });

      it('deactivates (soft-deletes) staff member and audits deactivation', async () => {
        const res = await api()
          .delete(`/api/v1/admin/staff/${createdStaffId}`)
          .set('Authorization', admin.token)
          .expect(200);

        const body = res.body as ApiEnvelope<UserData>;
        expect(body.success).toBe(true);
        expect(body.data.status).toBe(UserStatus.INACTIVE);

        // Verify audit log
        const log = await auditLogs.findOne({
          where: { action: 'STAFF_DEACTIVATED', entityId: createdStaffId },
        });
        expect(log).toBeDefined();
      });

      it('browses audit logs via GET /admin/audit-logs', async () => {
        const res = await api()
          .get('/api/v1/admin/audit-logs?page=1&limit=20')
          .set('Authorization', admin.token)
          .expect(200);

        const body = res.body as ApiEnvelope<unknown[]>;
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
      });

      it('gets platform analytics summary via GET /admin/analytics/summary', async () => {
        const res = await api()
          .get('/api/v1/admin/analytics/summary')
          .set('Authorization', admin.token)
          .expect(200);

        const body = res.body as ApiEnvelope<AnalyticsData>;
        expect(body.success).toBe(true);
        expect(body.data.users.total).toBeGreaterThan(0);
        expect(body.data.audit.totalLogs).toBeGreaterThan(0);
      });
    });
  },
);
