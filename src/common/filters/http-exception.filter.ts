import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';
import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
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
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    if (response.headersSent) {
      response.end();
      return;
    }

    const driverError: unknown =
      exception instanceof QueryFailedError ? exception.driverError : exception;
    const duplicateKey =
      driverError instanceof Error &&
      'code' in driverError &&
      driverError.code === '23505';
    const status = duplicateKey ? HttpStatus.CONFLICT : getStatus(exception);
    const validation =
      exception instanceof RequestValidationException ? exception : null;

    let message =
      status >= 500
        ? 'Internal server error'
        : (STATUS_CODES[status] ?? 'Request failed');
    if (duplicateKey) {
      message = 'A record with these values already exists';
    } else if (
      status >= 400 &&
      status < 500 &&
      exception instanceof HttpException &&
      (validation || http.getRequest<Request>().route)
    ) {
      // Framework errors before route matching can include the URL or input.
      message = exception.message;
    }

    response.status(status).json({
      success: false,
      message,
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
