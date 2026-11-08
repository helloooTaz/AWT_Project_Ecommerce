import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';
import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequestValidationException } from '../pipes/request-validation.pipe';

function getStatus(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  // Express middleware errors can carry a status without a Nest exception.
  if (exception instanceof Error && 'statusCode' in exception) {
    const { statusCode } = exception;
    if (
      typeof statusCode === 'number' &&
      Number.isInteger(statusCode) &&
      statusCode >= 400 &&
      statusCode < 500
    ) {
      return statusCode;
    }
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      response.end();
      return;
    }

    const status = getStatus(exception);
    const validation =
      exception instanceof RequestValidationException ? exception : null;

    response.status(status).json({
      success: false,
      message:
        validation?.message ??
        (status >= 500
          ? 'Internal server error'
          : (STATUS_CODES[status] ?? 'Request failed')),
      error: {
        code: validation
          ? 'VALIDATION_ERROR'
          : (HttpStatus[status] ?? 'HTTP_ERROR'),
        details: validation?.details ?? [],
      },
      meta: { requestId: randomUUID() },
    });
  }
}
