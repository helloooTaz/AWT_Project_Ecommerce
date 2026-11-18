import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  StaffActor,
  type StaffActorContext,
} from '../../common/decorators/staff-actor.decorator';
import { UserRole } from '../roles/user-role.enum';
import { ReturnQueryDto } from './dto/return-query.dto';
import { ReviewReturnRequestDto } from './dto/review-return-request.dto';
import { ReturnsService } from './returns.service';

@ApiTags('Staff - Returns')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Requires STAFF or ADMIN role' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN)
@Controller('staff/returns')
export class StaffReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  @ApiOperation({ summary: 'List all return requests across customers' })
  @ApiOkResponse({ description: 'Paginated list of return requests' })
  async findAll(@Query() query: ReturnQueryDto) {
    const result = await this.returnsService.findStaffReturns(query);
    return successResponse(result.items, 'OK', result.pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a return request' })
  @ApiParam({ name: 'id', description: 'Return request UUID' })
  @ApiOkResponse({
    description: 'Return request details with order and customer',
  })
  @ApiNotFoundResponse({ description: 'Return request not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const request = await this.returnsService.findById(id);
    return successResponse(request, 'OK');
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Approve or reject a customer return request' })
  @ApiParam({ name: 'id', description: 'Return request UUID' })
  @ApiOkResponse({
    description: 'Return request decision recorded and audited',
  })
  @ApiBadRequestResponse({
    description: 'Only REQUESTED return requests can be reviewed',
  })
  @ApiNotFoundResponse({ description: 'Return request not found' })
  async review(
    @StaffActor() actor: StaffActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReviewReturnRequestDto,
  ) {
    const reviewed = await this.returnsService.reviewRequest(
      actor.id,
      id,
      input,
    );
    return successResponse(
      reviewed,
      `Return request ${input.status.toLowerCase()}`,
    );
  }
}
