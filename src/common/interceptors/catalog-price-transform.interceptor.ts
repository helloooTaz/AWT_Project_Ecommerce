import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export function formatPriceMinor(priceMinor: number): string {
  const major = (priceMinor / 100).toFixed(2);
  const parts = major.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${parts.join('.')} BDT`;
}

interface VariantPayload {
  priceMinor?: number;
  priceFormatted?: string;
  [key: string]: unknown;
}

interface ProductPayload {
  variants?: VariantPayload[];
  variantCount?: number;
  pricingSummary?: {
    minPriceMinor: number;
    maxPriceMinor: number;
    minPriceFormatted: string;
    maxPriceFormatted: string;
  } | null;
  [key: string]: unknown;
}

interface WrappedResponse {
  data?: unknown;
  [key: string]: unknown;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function transformVariant(variant: unknown): unknown {
  if (!isRecord(variant)) return variant;
  if (typeof variant.priceMinor === 'number') {
    return {
      ...variant,
      priceFormatted: formatPriceMinor(variant.priceMinor),
    };
  }
  return variant;
}

function transformProduct(product: unknown): unknown {
  if (!isRecord(product)) return product;

  let transformed: ProductPayload = { ...product };

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const transformedVariants = product.variants.map(
      (v) => transformVariant(v) as VariantPayload,
    );
    const prices = transformedVariants
      .map((v) => v.priceMinor)
      .filter((p): p is number => typeof p === 'number');

    const minPriceMinor = prices.length ? Math.min(...prices) : null;
    const maxPriceMinor = prices.length ? Math.max(...prices) : null;

    transformed = {
      ...transformed,
      variants: transformedVariants,
      variantCount: transformedVariants.length,
      pricingSummary:
        minPriceMinor !== null && maxPriceMinor !== null
          ? {
              minPriceMinor,
              maxPriceMinor,
              minPriceFormatted: formatPriceMinor(minPriceMinor),
              maxPriceFormatted: formatPriceMinor(maxPriceMinor),
            }
          : null,
    };
  }

  return transformed;
}

function transformPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  if (Array.isArray(payload)) {
    return payload.map(transformProduct);
  }

  const response = payload as WrappedResponse;
  if ('data' in response && response.data !== undefined) {
    if (Array.isArray(response.data)) {
      return {
        ...response,
        data: response.data.map(transformProduct),
      };
    }
    return {
      ...response,
      data: transformProduct(response.data),
    };
  }

  return transformProduct(payload);
}

@Injectable()
export class CatalogPriceTransformInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => transformPayload(data)));
  }
}
