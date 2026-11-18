import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { UserRole } from '../roles/user-role.enum';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { ReturnQueryDto } from './dto/return-query.dto';
import { ReturnsService } from './returns.service';

@ApiTags('Returns')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a return request for a delivered order' })
  @ApiCreatedResponse({ description: 'Return request submitted successfully' })
  @ApiBadRequestResponse({
    description: 'Order not in DELIVERED status or invalid input',
  })
  @ApiConflictResponse({
    description: 'Return request already exists for this order',
  })
  @ApiNotFoundResponse({ description: 'Delivered order not found' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateReturnRequestDto,
  ) {
    const created = await this.returnsService.createRequest(user.id, input);
    return successResponse(created, 'Return request submitted');
  }

  @Get('me')
  @ApiOperation({ summary: 'List customer own return requests' })
  @ApiOkResponse({ description: 'Paginated list of return requests' })
  async findMyReturns(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReturnQueryDto,
  ) {
    const result = await this.returnsService.findMyReturns(user.id, query);
    return successResponse(result.items, 'OK', result.pagination);
  }
}
