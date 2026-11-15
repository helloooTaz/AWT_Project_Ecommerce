import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  InventoryActor,
  InventoryActorContext,
} from '../../common/decorators/inventory-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { FulfillmentQueryDto } from './dto/fulfillment-query.dto';
import { FulfillmentService } from './fulfillment.service';

@ApiTags('Fulfillment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.INVENTORY_MANAGER, Role.ADMIN)
@Controller('fulfillment')
export class FulfillmentController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @Get('orders')
  @ApiOperation({
    summary: 'List eligible confirmed/processing orders awaiting fulfillment',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of orders ready for pick and pack',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (requires INVENTORY_MANAGER or ADMIN)',
  })
  async listOrders(@Query() query: FulfillmentQueryDto) {
    return this.fulfillmentService.listOrders(query);
  }

  @Patch('orders/:id/pack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an order as packed in warehouse' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated to PROCESSING',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Invalid order state transition' })
  async packOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @InventoryActor() actor?: InventoryActorContext,
  ) {
    return this.fulfillmentService.packOrder(id, actor?.id);
  }

  @Post('orders/:id/shipments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create shipment, consume inventory reservation, and transition order to SHIPPED',
  })
  @ApiResponse({
    status: 201,
    description: 'Shipment created and stock consumed',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 409,
    description: 'Shipment conflict or insufficient reservation',
  })
  async createShipment(
    @Param('id', ParseUUIDPipe) id: string,
    @InventoryActor() actor?: InventoryActorContext,
    @Body() dto?: CreateShipmentDto,
  ) {
    return this.fulfillmentService.createShipment(id, actor?.id, dto);
  }
}
