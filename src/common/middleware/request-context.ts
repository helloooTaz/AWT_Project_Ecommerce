import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export function getRequestId(): string {
  return requestContext.getStore()?.requestId ?? randomUUID();
}
