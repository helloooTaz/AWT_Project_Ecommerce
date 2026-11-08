import {
  Body,
  Controller,
  Get,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsInt, Min } from 'class-validator';
import request from 'supertest';
import type { Server } from 'node:http';
import { configureApp } from '../../src/app.setup';
import { HealthController } from '../../src/health.controller';

class TestDto {
  @IsInt()
  @Min(1)
  quantity!: number;
}

@Controller('test')
class TestController {
  @Post()
  create(@Body() body: TestDto) {
    return body;
  }

  @Get('failure')
  fail() {
    throw new Error('Private database error');
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

  it('serves Swagger outside the versioned API prefix', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    expect(response.body).toHaveProperty(['paths', '/api/v1/health', 'get']);
  });
});
