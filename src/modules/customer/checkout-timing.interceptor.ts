import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { performance } from 'node:perf_hooks';
import { type Observable, tap } from 'rxjs';

@Injectable()
export class CheckoutTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();
    const setTimingHeader = () => {
      if (!response.headersSent) {
        response.setHeader('X-Response-Time', `${(performance.now() - startedAt).toFixed(2)}ms`);
      }
    };

    return next.handle().pipe(tap({ complete: setTimingHeader, error: setTimingHeader }));
  }
}
