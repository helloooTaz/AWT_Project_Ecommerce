import { randomUUID } from 'node:crypto';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function successResponse<T>(
  data: T,
  message = 'OK',
  pagination?: Pagination,
) {
  return {
    success: true as const,
    message,
    data,
    meta: { requestId: randomUUID(), ...(pagination && { pagination }) },
  };
}
