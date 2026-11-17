import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { randomUUID } from 'node:crypto';

export interface RawStockItem {
  id: string;
  variantId: string;
  onHand: number;
  reserved: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProjectedStockItem {
  id: string;
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
  stockStatus: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';
  reservationUtilizationPercent: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PaginatedInput<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function isRawStockItem(val: unknown): val is RawStockItem {
  return (
    typeof val === 'object' &&
    val !== null &&
    'variantId' in val &&
    'onHand' in val
  );
}

function projectItem(item: RawStockItem): ProjectedStockItem {
  const onHand = Number(item.onHand ?? 0);
  const reserved = Number(item.reserved ?? 0);
  const available = onHand - reserved;

  let stockStatus: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK' = 'IN_STOCK';
  if (available <= 0) {
    stockStatus = 'OUT_OF_STOCK';
  } else if (available <= 10) {
    stockStatus = 'LOW_STOCK';
  }

  const reservationUtilizationPercent =
    onHand > 0 ? Math.min(100, Math.round((reserved / onHand) * 100)) : 0;

  return {
    id: item.id,
    variantId: item.variantId,
    onHand,
    reserved,
    available,
    stockStatus,
    reservationUtilizationPercent,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

@Injectable()
export class StockProjectionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const requestId = randomUUID();

    return next.handle().pipe(
      map((response: unknown) => {
        if (
          typeof response === 'object' &&
          response !== null &&
          'items' in response &&
          Array.isArray((response as PaginatedInput<RawStockItem>).items)
        ) {
          const paginated = response as PaginatedInput<RawStockItem>;
          return {
            success: true,
            message: 'OK',
            data: paginated.items.map((it) => projectItem(it)),
            meta: {
              requestId,
              pagination: paginated.pagination,
            },
          };
        }

        if (Array.isArray(response)) {
          return {
            success: true,
            message: 'OK',
            data: response.filter(isRawStockItem).map((it) => projectItem(it)),
            meta: { requestId },
          };
        }

        if (isRawStockItem(response)) {
          return {
            success: true,
            message: 'OK',
            data: projectItem(response),
            meta: { requestId },
          };
        }

        return {
          success: true,
          message: 'OK',
          data: response,
          meta: { requestId },
        };
      }),
    );
  }
}
