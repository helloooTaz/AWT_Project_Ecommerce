import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse,
  ApiNoContentResponse, ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse } from '../../common/http/openapi';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { Role, type AuthenticatedUser } from '../auth/role';
import { CartResponseDto } from './cart.dto';
import { CartService } from './cart.service';
import { SetCartItemDto } from './customer.dto';

@ApiTags('Customer cart')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Customer role required' })
@Roles(Role.Customer)
@Controller('cart')
export class CartController {
  constructor(private readonly carts: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get the signed-in customer cart with current catalog prices' })
  @ApiDataResponse(CartResponseDto)
  @ApiConflictResponse({ description: 'Cart total exceeds the supported range' })
  get(@CurrentUser() user: AuthenticatedUser): Promise<CartResponseDto> {
    return this.carts.get(user.id);
  }

  @Put('items/:variantId')
  @ApiOperation({ summary: 'Set the quantity of a variant in the signed-in customer cart' })
  @ApiParam({ name: 'variantId', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(CartResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid quantity or version 4 UUID' })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  @ApiConflictResponse({ description: 'Variant is unavailable or cart total exceeds the supported range' })
  setItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId', new ParseUUIDPipe({ version: '4' })) variantId: string,
    @Body() input: SetCartItemDto,
  ): Promise<CartResponseDto> {
    return this.carts.setItem(user.id, variantId, input.quantity);
  }

  @Delete('items/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a variant from the signed-in customer cart' })
  @ApiParam({ name: 'variantId', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Cart item removed' })
  @ApiBadRequestResponse({ description: 'Variant ID must be a version 4 UUID' })
  @ApiNotFoundResponse({ description: 'Cart item not found' })
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId', new ParseUUIDPipe({ version: '4' })) variantId: string,
  ): Promise<void> {
    return this.carts.removeItem(user.id, variantId);
  }
}
