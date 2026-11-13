import {
  Body,
  ConflictException,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsInt, Min } from 'class-validator';
import request from 'supertest';
import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { QueryFailedError } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import { successResponse } from '../../src/common/dto/success-response';
import { RequestLoggingMiddleware } from '../../src/common/middleware/request-logging.middleware';
import { HealthController } from '../../src/health.controller';

class TestDto {
  @IsInt()
  @Min(1)
  quantity!: number;
}

@Controller('test')
class TestController {
  @Post()
  async create(@Body() body: TestDto) {
    await delay(body.quantity);
    return successResponse(body);
  }

  @Get('missing')
  missing() {
    throw new NotFoundException('Requested record was not found');
  }

  @Get('conflict')
  conflict() {
    throw new ConflictException('The record has already been processed');
  }

  @Get('duplicate')
  duplicate() {
    const driverError = Object.assign(new Error('Duplicate database value'), {
      code: '23505',
      constraint: 'private_unique_constraint',
      detail: 'Key (email)=(private@example.test) already exists.',
    });
    throw new QueryFailedError(
      'INSERT INTO private_table VALUES ($1)',
      ['private@example.test'],
      driverError,
    );
  }

  @Get('failure')
  fail() {
    throw new Error('Private database error');
  }

  @Get('internal-error')
  internalError() {
    throw new InternalServerErrorException('Private server error');
  }
}

describe('HTTP foundation', () => {
  let app: INestApplication<Server>;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const requestId: unknown = expect.stringMatching(uuid);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController, TestController],
      providers: [RequestLoggingMiddleware],
    }).compile();

    app = module.createNestApplication<INestApplication<Server>>();
    configureApp(app, true);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves health under the versioned prefix', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'OK',
      data: { status: 'ok' },
      meta: { requestId },
    });
    expect(response.headers['x-request-id']).toMatch(uuid);
    expect(response.body).toHaveProperty(
      'meta.requestId',
      response.headers['x-request-id'],
    );
  });

  it('returns a consistent error for an unknown route', async () => {
    const response = await request(app.getHttpServer())
      .get('/health?token=private')
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      message: 'Not Found',
      error: { code: 'NOT_FOUND', details: [] },
      meta: { requestId },
    });
    expect(response.headers['x-request-id']).toMatch(uuid);
    expect(response.body).toHaveProperty(
      'meta.requestId',
      response.headers['x-request-id'],
    );
  });

  it('correlates concurrent asynchronous responses independently', async () => {
    const responses = await Promise.all(
      [30, 15, 1].map((quantity) =>
        request(app.getHttpServer())
          .post('/api/v1/test')
          .set('X-Request-ID', 'untrusted-client-id')
          .send({ quantity })
          .expect(201),
      ),
    );
    const ids = responses.map((response) => {
      const id: unknown = response.headers['x-request-id'];
      expect(id).toMatch(uuid);
      expect(response.body).toHaveProperty('meta.requestId', id);
      return id;
    });
    expect(new Set(ids).size).toBe(responses.length);
  });

  it('logs completed requests without headers, query parameters or bodies', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});
    try {
      const ok = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
      const failed = await request(app.getHttpServer())
        .post('/api/v1/test?token=private-query')
        .set('Authorization', 'Bearer private-token')
        .set('Cookie', 'session=private-cookie')
        .set('X-Mock-Payment-Signature', 'private-signature')
        .send({ quantity: 0, password: 'private-password' })
        .expect(400);
      const durationMs: unknown = expect.any(Number);
      expect(log).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenNthCalledWith(1, {
        method: 'GET',
        path: '/api/v1/health',
        requestId: ok.headers['x-request-id'],
        statusCode: 200,
        durationMs,
      });
      expect(log).toHaveBeenNthCalledWith(2, {
        method: 'POST',
        path: '/api/v1/test',
        requestId: failed.headers['x-request-id'],
        statusCode: 400,
        durationMs,
      });
      for (const [entry] of log.mock.calls) {
        expect(
          (entry as { durationMs: number }).durationMs,
        ).toBeGreaterThanOrEqual(0);
      }
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    ['missing', 404, 'NOT_FOUND', 'Requested record was not found'],
    ['conflict', 409, 'CONFLICT', 'The record has already been processed'],
    ['duplicate', 409, 'CONFLICT', 'A record with these values already exists'],
  ])('returns a safe message for %s', async (route, status, code, message) => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/test/${route}`)
      .expect(status);

    expect(response.body).toEqual({
      success: false,
      message,
      error: { code, details: [] },
      meta: { requestId },
    });
  });

  it('returns field errors for invalid values and unexpected properties', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/test')
      .send({ quantity: 0, extra: 'ignored' })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: 'Validation failed',
      error: {
        code: 'VALIDATION_ERROR',
        details: [
          { field: 'extra', message: 'property extra should not exist' },
          { field: 'quantity', message: 'quantity must not be less than 1' },
        ],
      },
      meta: { requestId },
    });
  });

  it('returns a safe 400 for malformed JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/test')
      .type('json')
      .send('private')
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: 'Bad Request',
      error: { code: 'BAD_REQUEST', details: [] },
      meta: { requestId },
    });
    expect(response.headers['x-request-id']).toMatch(uuid);
    expect(response.body).toHaveProperty(
      'meta.requestId',
      response.headers['x-request-id'],
    );
  });

  it('hides unexpected exception messages', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test/failure')
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      message: 'Internal server error',
      error: { code: 'INTERNAL_SERVER_ERROR', details: [] },
      meta: { requestId },
    });
  });

  it('hides explicitly thrown internal server error messages', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test/internal-error')
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      message: 'Internal server error',
      error: { code: 'INTERNAL_SERVER_ERROR', details: [] },
      meta: { requestId },
    });
  });

  it('serves Swagger outside the versioned API prefix', async () => {
    await request(app.getHttpServer())
      .get('/api/docs')
      .expect('X-Request-ID', uuid)
      .expect(200);
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect('X-Request-ID', uuid)
      .expect(200);

    expect(response.body).toHaveProperty(['paths', '/api/v1/health', 'get']);
  });
});
