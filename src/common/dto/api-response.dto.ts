export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponseMeta {
  requestId?: string;
  pagination?: PaginationMeta;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta: ApiResponseMeta;
}
