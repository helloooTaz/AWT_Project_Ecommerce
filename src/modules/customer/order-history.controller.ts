import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse, ApiPageResponse } from '../../common/http/openapi';
import { Page, PageQueryDto } from '../../common/http/pagination';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { Role, type AuthenticatedUser } from '../auth/role';
import { OrderDetailDto, OrderSummaryDto } from './order-history.dto';
import { OrderHistoryService } from './order-history.service';

@ApiTags('Customer orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Customer role required' })
@Roles(Role.Customer)
@Controller('orders')
export class OrderHistoryController {
  constructor(private readonly orders: OrderHistoryService) {}

  @Get()
  @ApiOperation({ summary: 'List orders owned by the signed-in customer, newest first' })
  @ApiPageResponse(OrderSummaryDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination query' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: PageQueryDto): Promise<Page<OrderSummaryDto>> {
    return this.orders.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an owned order with its shipping address and item snapshots' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(OrderDetailDto)
  @ApiBadRequestResponse({ description: 'Order ID must be a version 4 UUID' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<OrderDetailDto> {
    return this.orders.get(user.id, id);
  }
}
