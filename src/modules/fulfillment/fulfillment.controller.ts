import {
  Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse,
  ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse, ApiPageResponse } from '../../common/http/openapi';
import type { Page } from '../../common/http/pagination';
import { Roles } from '../auth/auth.decorators';
import { Role } from '../auth/role';
import {
  CreateShipmentDto, FulfillmentOrderSummaryDto, FulfillmentQueryDto, PackOrderResponseDto,
} from './fulfillment.dto';
import { FulfillmentService } from './fulfillment.service';
import { ShipmentResponseDto } from '../shipments/shipments.dto';

@ApiTags('Fulfillment')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Inventory Manager or Admin role required' })
@Roles(Role.InventoryManager, Role.Admin)
@Controller('fulfillment')
export class FulfillmentController {
  constructor(private readonly fulfillment: FulfillmentService) {}

  @Get('orders')
  @ApiOperation({ summary: 'List orders awaiting fulfillment' })
  @ApiPageResponse(FulfillmentOrderSummaryDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination or status filter' })
  listOrders(@Query() query: FulfillmentQueryDto): Promise<Page<FulfillmentOrderSummaryDto>> {
    return this.fulfillment.listOrders(query);
  }

  @Patch('orders/:id/pack')
  @ApiOperation({ summary: 'Mark an order as packed (processing)' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(PackOrderResponseDto)
  @ApiBadRequestResponse({ description: 'Order ID must be a version 4 UUID' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiConflictResponse({ description: 'Order cannot be packed in its current status' })
  packOrder(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<PackOrderResponseDto> {
    return this.fulfillment.packOrder(id);
  }

  @Post('orders/:id/shipments')
  @ApiOperation({ summary: 'Create shipment and mark order as shipped' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(ShipmentResponseDto, HttpStatus.CREATED)
  @ApiBadRequestResponse({ description: 'Invalid shipment input or order ID' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiConflictResponse({ description: 'Shipment already exists, tracking in use, or invalid order status' })
  createShipment(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: CreateShipmentDto,
  ): Promise<ShipmentResponseDto> {
    return this.fulfillment.createShipment(id, input);
  }
}
