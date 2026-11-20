import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiResponse, type ApiResponseOptions, getSchemaPath } from '@nestjs/swagger';

export function ApiDataResponse(model: Type<unknown>, status = 200, headers?: ApiResponseOptions['headers']) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      headers,
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: getSchemaPath(model) },
        },
      },
    }),
  );
}

export function ApiPageResponse(model: Type<unknown>) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: {
            type: 'object',
            required: ['page', 'limit', 'total'],
            properties: {
              page: { type: 'integer', minimum: 1 },
              limit: { type: 'integer', minimum: 1 },
              total: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
    }),
  );
}
