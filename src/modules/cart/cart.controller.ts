import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UserRole } from '../roles/user-role.enum';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const itemExample = {
  id: '6f2d7ea0-6df8-41f5-a28a-493bdaed806d',
  variantId: '6268504d-c404-4730-9abb-9e8bd527f06a',
  quantity: 2,
};
const itemEnvelope = {
  success: true,
  message: 'OK',
  data: itemExample,
  meta: { requestId: 'ae1c8b3a-2341-4a74-a58a-5b30667b2220' },
};

@ApiTags('Shopping cart')
@ApiBearerAuth()
@ApiBadRequestResponse({
  description: 'Invalid cart item ID or request fields',
})
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Customer role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.CUSTOMER])
@Controller('me/cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOkResponse({
    schema: {
      example: {
        ...itemEnvelope,
        data: {
          items: [
            {
              ...itemExample,
              product: {
                id: '75b2754b-1ec1-47b6-8e47-f953629aa80b',
                name: 'Cotton Shirt',
                slug: 'cotton-shirt',
                status: 'PUBLISHED',
              },
              variant: {
                sku: 'SHIRT-M-BLUE',
                size: 'M',
                color: 'Blue',
                isActive: true,
              },
              priceMinor: 125000,
              availableQuantity: 4,
              canPurchase: true,
            },
          ],
          subtotalMinor: 250000,
          currency: 'BDT',
        },
      },
    },
  })
  async get(@CurrentUser() user: AuthenticatedUser) {
    return successResponse(await this.cart.get(user.id));
  }

  @Post('items')
  @ApiCreatedResponse({
    schema: { example: { ...itemEnvelope, message: 'Cart item added' } },
  })
  @ApiNotFoundResponse({ description: 'Purchasable variant not found' })
  @ApiConflictResponse({ description: 'Variant is already in the cart' })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: AddCartItemDto,
  ) {
    return successResponse(
      await this.cart.add(user.id, input),
      'Cart item added',
    );
  }

  @Patch('items/:itemId')
  @ApiOkResponse({ schema: { example: itemEnvelope } })
  @ApiNotFoundResponse({ description: 'Cart item not found' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() input: UpdateCartItemDto,
  ) {
    return successResponse(
      await this.cart.update(user.id, itemId, input.quantity),
    );
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Cart item removed' })
  @ApiNotFoundResponse({ description: 'Cart item not found' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.cart.remove(user.id, itemId);
  }
}
