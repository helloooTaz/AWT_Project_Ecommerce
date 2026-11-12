import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { successResponse } from '../../common/dto/success-response';
import { RequestValidationException } from '../../common/pipes/request-validation.pipe';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UserRole } from '../roles/user-role.enum';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';

const keyPattern = '^[A-Za-z0-9._-]{1,128}$';
const idempotencyKey = new RegExp(keyPattern);
const createdExample = {
  success: true,
  message: 'Order created',
  data: {
    orderId: '6268504d-c404-4730-9abb-9e8bd527f06a',
    status: 'PENDING_PAYMENT',
    currency: 'BDT',
    totalMinor: '520000',
  },
  meta: { requestId: 'ae1c8b3a-2341-4a74-a58a-5b30667b2220' },
};

@ApiTags('Checkout')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.CUSTOMER])
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', pattern: keyPattern },
    description: 'Unique request key per customer',
  })
  @ApiCreatedResponse({
    description:
      'Order created with stock reserved. The total is in BDT minor units.',
    schema: { example: createdExample },
  })
  @ApiOkResponse({
    description: 'Existing order returned for the same key and address',
    schema: {
      example: { ...createdExample, message: 'Order already created' },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request, missing key, or empty cart',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Customer role required' })
  @ApiNotFoundResponse({
    description: 'Address or purchasable variant not found',
  })
  @ApiConflictResponse({
    description:
      'Insufficient stock, unsupported price, or conflicting key reuse',
  })
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() { addressId }: CheckoutDto,
    @Headers('idempotency-key') requestKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (typeof requestKey !== 'string' || !idempotencyKey.test(requestKey)) {
      throw new RequestValidationException([
        {
          field: 'Idempotency-Key',
          message:
            'must be 1 to 128 letters, digits, dots, underscores, or hyphens',
        },
      ]);
    }
    const { order, replayed } = await this.checkoutService.checkout(
      user.id,
      addressId,
      requestKey,
    );
    if (replayed) {
      response.status(HttpStatus.OK);
    }
    return successResponse(
      {
        orderId: order.id,
        status: order.status,
        currency: order.currency,
        totalMinor: order.totalMinor,
      },
      replayed ? 'Order already created' : 'Order created',
    );
  }
}
