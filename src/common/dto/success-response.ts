import { randomUUID } from 'node:crypto';

export function successResponse<T>(data: T, message = 'OK') {
  return {
    success: true as const,
    message,
    data,
    meta: { requestId: randomUUID() },
  };
}
