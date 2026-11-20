import { Body, Controller, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse,
  ApiNotFoundResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse } from '../../common/http/openapi';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { Role, type AuthenticatedUser } from '../auth/role';
import { CheckoutTimingInterceptor } from './checkout-timing.interceptor';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './customer.dto';
import { OrderDetailDto } from './order-history.dto';

@ApiTags('Customer checkout')
@ApiBearerAuth()
@Roles(Role.Customer)
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  @UseInterceptors(CheckoutTimingInterceptor)
  @ApiOperation({ summary: 'Place a cash-on-delivery order from the signed-in customer cart' })
  @ApiDataResponse(OrderDetailDto, HttpStatus.CREATED, {
    'X-Response-Time': {
      description: 'Checkout execution time in milliseconds',
      schema: { type: 'string', example: '12.34ms' },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid input, empty cart, or order total exceeds the supported range' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Customer role required' })
  @ApiNotFoundResponse({ description: 'Address not found' })
  @ApiConflictResponse({ description: 'Unavailable cart variant or insufficient stock' })
  placeOrder(@CurrentUser() user: AuthenticatedUser, @Body() input: CheckoutDto): Promise<OrderDetailDto> {
    return this.checkout.placeOrder(user.id, input.addressId);
  }
}
