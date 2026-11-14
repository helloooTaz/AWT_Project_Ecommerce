import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ShipmentsService } from './shipments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.INVENTORY_MANAGER, Role.ADMIN, Role.STAFF)
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get shipment tracking details by order ID' })
  @ApiResponse({ status: 200, description: 'Shipment record' })
  @ApiResponse({ status: 404, description: 'Shipment not found' })
  async getByOrderId(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.shipmentsService.getByOrderId(orderId);
  }

  @Get('tracking/:trackingNumber')
  @ApiOperation({ summary: 'Get shipment tracking details by tracking number' })
  @ApiResponse({ status: 200, description: 'Shipment record' })
  @ApiResponse({ status: 404, description: 'Tracking number not found' })
  async getByTrackingNumber(@Param('trackingNumber') trackingNumber: string) {
    return this.shipmentsService.getByTrackingNumber(trackingNumber);
  }
}
