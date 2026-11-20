import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import type { AppRequest } from './request-context';

interface ErrorDetails {
  statusCode: number;
  message: string | string[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<AppRequest>();
    const response = context.getResponse<Response>();
    const { statusCode, message } = this.describe(exception);

    if (statusCode === 500) {
      const kind = exception instanceof Error ? exception.name : 'Unknown error';
      this.logger.error(`${kind} on ${request.method}, request ${request.requestId}`);
    }

    if (response.headersSent) return;
    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      requestId: request.requestId,
    });
  }

  private describe(exception: unknown): ErrorDetails {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      if (statusCode === 500) return this.internalError();

      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : (body as { message?: unknown }).message;
      if (typeof message === 'string' ||
          (Array.isArray(message) && message.every((item) => typeof item === 'string'))) {
        return { statusCode, message };
      }
      return { statusCode, message: 'Request failed' };
    }

    if (exception instanceof QueryFailedError) {
      const code = (exception.driverError as { code?: string }).code;
      if (code === '23505') {
        return { statusCode: 409, message: 'A record with that value already exists' };
      }
      if (code === '23503' || code === '23001') {
        return { statusCode: 409, message: 'A related record prevents this change' };
      }
      if (code === '23514' || code === '22003') {
        return { statusCode: 400, message: 'A value is outside the permitted range' };
      }
    }

    return this.internalError();
  }

  private internalError(): ErrorDetails {
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}
