import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
  type CanActivate,
  type ExecutionContext,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Environment } from '../../config/env.validation';

export const mockSignatureHeader = 'X-Mock-Payment-Signature';
const windowMs = 60_000;
const requestsPerIp = 60;
const maxTrackedIps = 1024;

@Injectable()
export class MockPaymentWebhookGuard implements CanActivate {
  private windowEndsAt = 0;
  private readonly requestsByIp = new Map<string, number>();

  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get('MOCK_PAYMENT_SIGNING_SECRET', {
      infer: true,
    });
    if (
      this.config.get('PAYMENT_PROVIDER', { infer: true }) !== 'MOCK' ||
      !secret
    ) {
      throw new NotFoundException('Mock payments are disabled');
    }

    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request>>();
    this.limitRequests(request.ip ?? request.socket.remoteAddress ?? 'unknown');

    const signature = request.get(mockSignatureHeader);
    if (signature?.length !== 64 || !/^[a-f0-9]+$/i.test(signature)) {
      throw new UnauthorizedException('Invalid mock payment signature');
    }
    const encoding = request.get('Content-Encoding');
    if (
      !request.is('application/json') ||
      (encoding && encoding.toLowerCase() !== 'identity')
    ) {
      throw new UnsupportedMediaTypeException(
        'Expected uncompressed application/json',
      );
    }
    const { rawBody } = request;
    if (
      !rawBody ||
      !timingSafeEqual(
        createHmac('sha256', secret).update(rawBody).digest(),
        Buffer.from(signature, 'hex'),
      )
    ) {
      throw new UnauthorizedException('Invalid mock payment signature');
    }

    const body: unknown = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Expected a JSON object');
    }
    return true;
  }

  private limitRequests(ip: string): void {
    const now = Date.now();
    if (now >= this.windowEndsAt) {
      this.requestsByIp.clear();
      this.windowEndsAt = now + windowMs;
    }

    const count = this.requestsByIp.get(ip) ?? 0;
    if (
      count >= requestsPerIp ||
      (count === 0 && this.requestsByIp.size >= maxTrackedIps)
    ) {
      throw new HttpException(
        'Too many mock payment callbacks',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.requestsByIp.set(ip, count + 1);
  }
}
