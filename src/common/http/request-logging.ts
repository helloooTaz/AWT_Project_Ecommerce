import { Logger } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { performance } from 'node:perf_hooks';
import type { AppRequest } from './request-context';

const logger = new Logger('HTTP');

export function requestLogging(req: AppRequest, res: Response, next: NextFunction): void {
  const startedAt = performance.now();
  res.once('finish', () => {
    // The route template excludes query values and user-controlled path parameters.
    const route = req.route as { path?: unknown } | undefined;
    const path = typeof route?.path === 'string' ? route.path : '[unmatched]';
    const duration = (performance.now() - startedAt).toFixed(2);
    logger.log(`${req.method} ${path} ${res.statusCode} ${duration}ms requestId=${req.requestId}`);
  });
  next();
}
