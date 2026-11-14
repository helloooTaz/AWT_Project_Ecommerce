import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { StockMovementQueryDto } from '../stock-movements/dto/stock-movement-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import {
  InventoryActor,
  InventoryActorContext,
} from '../../common/decorators/inventory-actor.decorator';
import { StockProjectionInterceptor } from '../../common/interceptors/stock-projection.interceptor';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.INVENTORY_MANAGER, Role.ADMIN)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly stockMovementsService: StockMovementsService,
  ) {}

  @Get()
  @UseInterceptors(StockProjectionInterceptor)
  @ApiOperation({
    summary: 'Paginated stock overview with availability projection',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated inventory balance records',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (requires INVENTORY_MANAGER or ADMIN)',
  })
  async getOverview(@Query() query: InventoryQueryDto) {
    return this.inventoryService.getOverview(query);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Paginated stock movement audit trail' })
  @ApiResponse({
    status: 200,
    description: 'List of historical stock movements',
  })
  async getMovements(@Query() query: StockMovementQueryDto) {
    return this.stockMovementsService.listMovements(query);
  }

  @Get(':variantId')
  @UseInterceptors(StockProjectionInterceptor)
  @ApiOperation({ summary: 'Get stock balance for a specific variant' })
  @ApiResponse({ status: 200, description: 'Inventory balance record' })
  @ApiResponse({ status: 404, description: 'Variant balance not found' })
  async getByVariantId(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.inventoryService.getByVariantId(variantId);
  }

  @Post('receipts')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(StockProjectionInterceptor)
  @ApiOperation({ summary: 'Receive stock shipment for a SKU variant' })
  @ApiResponse({
    status: 201,
    description: 'Stock received and movement recorded',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Variant does not exist' })
  async receiveStock(
    @InventoryActor() actor: InventoryActorContext | undefined,
    @Body() dto: CreateReceiptDto,
  ) {
    return this.inventoryService.receiveStock(actor?.id ?? null, dto);
  }

  @Post('adjustments')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(StockProjectionInterceptor)
  @ApiOperation({ summary: 'Adjust stock count with operational reason' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjusted and movement recorded',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Variant or balance not found' })
  @ApiResponse({
    status: 409,
    description: 'Adjustment conflict (insufficient available stock)',
  })
  async adjustStock(
    @InventoryActor() actor: InventoryActorContext | undefined,
    @Body() dto: CreateAdjustmentDto,
  ) {
    return this.inventoryService.adjustStock(actor?.id ?? null, dto);
  }
}
