import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StockMovementsService } from './stock-movements.service';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Stock Movements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.INVENTORY_MANAGER, Role.ADMIN)
@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly stockMovementsService: StockMovementsService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated stock movement audit trail' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of historical stock movements',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (requires INVENTORY_MANAGER or ADMIN)',
  })
  async listMovements(@Query() query: StockMovementQueryDto) {
    return this.stockMovementsService.listMovements(query);
  }
}
