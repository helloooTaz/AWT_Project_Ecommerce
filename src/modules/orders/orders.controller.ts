import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { successResponse } from '../../common/dto/success-response';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UserRole } from '../roles/user-role.enum';
import { OrderStatus } from './entities/order.entity';
import { OrderCancellationService } from './order-cancellation.service';
import { OrdersService } from './orders.service';

const orderExample = {
  id: '6268504d-c404-4730-9abb-9e8bd527f06a',
  status: OrderStatus.CONFIRMED,
  currency: 'BDT',
  totalMinor: '250000',
  createdAt: '2026-11-12T08:00:00.000Z',
  updatedAt: '2026-11-12T08:01:00.000Z',
};
const detailExample = {
  ...orderExample,
  shippingAddressSnapshot: {
    recipient: 'Samira Rahman',
    phone: '+8801712345678',
    addressLine1: 'House 12, Road 5',
    addressLine2: null,
    city: 'Dhaka',
  },
  items: [
    {
      id: '7640e823-4cc6-4ad5-bf05-9628987bc967',
      variantId: '884e1eb9-b772-4d38-b673-8f259d530bbc',
      skuSnapshot: 'SHIRT-M-BLUE',
      nameSnapshot: 'Cotton Shirt',
      sizeSnapshot: 'M',
      colorSnapshot: 'Blue',
      unitPriceMinor: '125000',
      quantity: 2,
      lineTotalMinor: '250000',
      createdAt: orderExample.createdAt,
    },
  ],
};
const exampleMeta = { requestId: '6f2d7ea0-6df8-41f5-a28a-493bdaed806d' };
const envelopeExample = { success: true, message: 'OK', meta: exampleMeta };

@ApiTags('Orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Customer role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.CUSTOMER])
@Controller('me/orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly cancellation: OrderCancellationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List your orders, newest first' })
  @ApiBadRequestResponse({ description: 'Invalid pagination' })
  @ApiOkResponse({
    description: 'Order totals are decimal strings in BDT minor units',
    schema: {
      example: {
        ...envelopeExample,
        data: [orderExample],
        meta: {
          ...exampleMeta,
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      },
    },
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    const { orders, pagination } = await this.orders.listForCustomer(
      user.id,
      query,
    );
    return successResponse(orders, 'OK', pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read your order with its purchase-time snapshots' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiBadRequestResponse({ description: 'Invalid order ID' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiOkResponse({
    description:
      'Amounts are decimal strings in BDT minor units. A removed variant has a null variantId.',
    schema: { example: { ...envelopeExample, data: detailExample } },
  })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.orders.getForCustomer(user.id, id));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel your pending payment order',
    description:
      'Only PENDING_PAYMENT orders are eligible. Repeating a cancellation returns 409.',
  })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiBadRequestResponse({ description: 'Invalid order ID' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiConflictResponse({
    description: 'Order cannot be cancelled or stock could not be released',
  })
  @ApiOkResponse({
    schema: {
      example: {
        ...envelopeExample,
        data: { orderId: orderExample.id, status: OrderStatus.CANCELLED },
      },
    },
  })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(
      await this.cancellation.cancelForCustomer(user.id, id),
    );
  }
}
