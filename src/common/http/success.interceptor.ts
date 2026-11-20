import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';
import { Page } from './pagination';

@Injectable()
export class SuccessInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(map((result: unknown) => {
      if (response.statusCode === 204) return undefined;
      if (result instanceof Page) {
        return { success: true, data: result.items, meta: result.meta };
      }
      return { success: true, data: result ?? null };
    }));
  }
}
