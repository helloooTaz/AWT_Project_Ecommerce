import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse } from '../../common/http/openapi';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { Role, type AuthenticatedUser } from '../auth/role';
import { ShipmentResponseDto } from './shipments.dto';
import { ShipmentsService } from './shipments.service';

@ApiTags('Shipments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Authenticated role required' })
@Roles(Role.InventoryManager, Role.Admin, Role.Staff, Role.Customer)
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get shipment tracking details by order ID' })
  @ApiParam({ name: 'orderId', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(ShipmentResponseDto)
  @ApiBadRequestResponse({ description: 'Order ID must be a version 4 UUID' })
  @ApiNotFoundResponse({ description: 'Shipment not found for order' })
  getByOrderId(
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShipmentResponseDto> {
    return this.shipments.getByOrderId(orderId, user);
  }

  @Get('tracking/:trackingNumber')
  @ApiOperation({ summary: 'Get shipment tracking details by tracking number' })
  @ApiParam({ name: 'trackingNumber', schema: { type: 'string' } })
  @ApiDataResponse(ShipmentResponseDto)
  @ApiNotFoundResponse({ description: 'Shipment not found' })
  getByTrackingNumber(
    @Param('trackingNumber') trackingNumber: string,
  ): Promise<ShipmentResponseDto> {
    return this.shipments.getByTrackingNumber(trackingNumber);
  }
}
