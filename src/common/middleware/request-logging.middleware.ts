import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggingMiddleware.name);

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = performance.now();
    const requestId = randomUUID();
    const { method, path } = request;

    response.setHeader('X-Request-ID', requestId);
    response.once('finish', () => {
      this.logger.log({
        method,
        path,
        requestId,
        statusCode: response.statusCode,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
      });
    });

    requestContext.run({ requestId }, next);
  }
}
