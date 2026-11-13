import { performance } from 'node:perf_hooks';
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { tap, type Observable } from 'rxjs';

@Injectable()
export class ResponseTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();
    const setTimingHeader = () => {
      if (!response.headersSent) {
        const duration = (performance.now() - startedAt).toFixed(2);
        response.setHeader('X-Response-Time', `${duration}ms`);
      }
    };

    return next
      .handle()
      .pipe(tap({ next: setTimingHeader, error: setTimingHeader }));
  }
}
