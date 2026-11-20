import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse, ApiPageResponse } from '../../common/http/openapi';
import type { Page } from '../../common/http/pagination';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { Role, type AuthenticatedUser } from '../auth/role';
import {
  AdjustStockDto, InventoryPageQueryDto, MovementResponseDto, ReceiveStockDto, StockChangeResponseDto,
  StockResponseDto,
} from './inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Inventory Manager or Admin role required' })
@Roles(Role.InventoryManager, Role.Admin)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('stock')
  @ApiOperation({ summary: 'List current stock for catalog variants' })
  @ApiPageResponse(StockResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination or variant filter' })
  listStock(@Query() query: InventoryPageQueryDto): Promise<Page<StockResponseDto>> {
    return this.inventory.listStock(query);
  }

  @Get('stock/:variantId')
  @ApiOperation({ summary: 'Get stock and product information for a variant' })
  @ApiParam({ name: 'variantId', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(StockResponseDto)
  @ApiBadRequestResponse({ description: 'Variant ID must be a version 4 UUID' })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  getStock(
    @Param('variantId', new ParseUUIDPipe({ version: '4' })) variantId: string,
  ): Promise<StockResponseDto> {
    return this.inventory.getStock(variantId);
  }

  @Post('receipts')
  @ApiOperation({ summary: 'Receive stock and record a receipt movement' })
  @ApiDataResponse(StockChangeResponseDto, HttpStatus.CREATED)
  @ApiBadRequestResponse({ description: 'Invalid variant ID, quantity, or reason' })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  @ApiConflictResponse({ description: 'Resulting quantity would exceed the stock limit' })
  receive(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: ReceiveStockDto,
  ): Promise<StockChangeResponseDto> {
    return this.inventory.receive(input, actor.id);
  }

  @Post('adjustments')
  @ApiOperation({ summary: 'Adjust stock and record an adjustment movement' })
  @ApiDataResponse(StockChangeResponseDto, HttpStatus.CREATED)
  @ApiBadRequestResponse({ description: 'Invalid variant ID, delta, or reason' })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  @ApiConflictResponse({ description: 'Resulting quantity would be negative or exceed the stock limit' })
  adjust(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: AdjustStockDto,
  ): Promise<StockChangeResponseDto> {
    return this.inventory.adjust(input, actor.id);
  }

  @Get('movements')
  @ApiOperation({ summary: 'List stock movements, newest first' })
  @ApiPageResponse(MovementResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination or variant filter' })
  listMovements(@Query() query: InventoryPageQueryDto): Promise<Page<MovementResponseDto>> {
    return this.inventory.listMovements(query);
  }
}
