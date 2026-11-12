import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import { RequestValidationException } from '../../common/pipes/request-validation.pipe';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UserRole } from '../roles/user-role.enum';
import { MockPaymentEventDto } from './dto/mock-payment-event.dto';
import {
  mockSignatureHeader,
  MockPaymentWebhookGuard,
} from './mock-payment-webhook.guard';
import { PaymentsService } from './payments.service';

const responseExample = {
  success: true,
  message: 'OK',
  meta: { requestId: '6f2d7ea0-6df8-41f5-a28a-493bdaed806d' },
};

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders/:id/payment-session')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles([UserRole.CUSTOMER])
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create or reuse a mock payment session for your order',
    description:
      'MOCK mode only. Send an empty request. The amount is read from the order.',
  })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({
    description: 'Session details with the exact amount in BDT minor units',
    schema: {
      example: {
        ...responseExample,
        data: {
          provider: 'MOCK',
          providerRef: 'c99f1619-d5a6-4a56-94d4-1dbd8f1bff4b',
          status: 'PENDING',
          amountMinor: '250000',
          currency: 'BDT',
          expiresAt: '2026-11-12T08:15:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid order ID or unexpected body' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Customer role required' })
  @ApiNotFoundResponse({
    description: 'Order not found or mock payments disabled',
  })
  @ApiConflictResponse({
    description: 'Order or reservation is no longer payable',
  })
  async createSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    if (
      body !== undefined &&
      (!body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length > 0)
    ) {
      throw new RequestValidationException([
        { field: 'body', message: 'Payment session does not accept input' },
      ]);
    }
    return successResponse(await this.payments.createSession(user.id, id));
  }

  @Post('webhooks/payments/mock')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MockPaymentWebhookGuard)
  @ApiOperation({
    summary: 'Accept a signed mock-provider payment outcome',
    description:
      'MOCK mode only. Sign the exact uncompressed JSON bytes. Retry with the same event ID and fields.',
  })
  @ApiConsumes('application/json')
  @ApiHeader({
    name: mockSignatureHeader,
    required: true,
    description: '64 hexadecimal characters of the HMAC-SHA256 digest',
  })
  @ApiOkResponse({
    description:
      'Acknowledgement. duplicate is true for a previously accepted event ID.',
    schema: { example: { ...responseExample, data: { duplicate: false } } },
  })
  @ApiBadRequestResponse({ description: 'Invalid callback body' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid signature' })
  @ApiNotFoundResponse({
    description: 'Mock mode disabled or session not found',
  })
  @ApiConflictResponse({
    description: 'Amount, state, reservation, or event ID conflict',
  })
  @ApiResponse({
    status: 415,
    description: 'Expected uncompressed application/json',
  })
  @ApiResponse({
    status: 429,
    description: 'Mock callback rate limit exceeded',
  })
  async mockWebhook(@Body() body: MockPaymentEventDto) {
    return successResponse(await this.payments.processMockEvent(body));
  }
}
