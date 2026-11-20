import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse, ApiPageResponse } from '../../common/http/openapi';
import type { Page } from '../../common/http/pagination';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { UserResponseDto } from '../auth/auth.dto';
import { Role, type AuthenticatedUser } from '../auth/role';
import { CreateStaffAccountDto, StaffAccountQueryDto, StaffAccountResponseDto, UpdateStaffAccountDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Valid bearer token for an active account required' })
@ApiForbiddenResponse({ description: 'Admin role required' })
@Roles(Role.Admin)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('access')
  @ApiOperation({ summary: 'Verify access as an Admin' })
  @ApiDataResponse(UserResponseDto)
  checkAccess(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Post('staff')
  @ApiOperation({ summary: 'Create an active Staff or Inventory Manager account' })
  @ApiBody({
    type: CreateStaffAccountDto,
    examples: {
      staff: {
        summary: 'Staff account',
        value: { name: 'Catalog Staff', email: 'staff@example.com', password: 'DemoPass123!', role: Role.Staff },
      },
      inventoryManager: {
        summary: 'Inventory Manager account',
        value: {
          name: 'Inventory Manager One', email: 'inventory1@example.com',
          password: 'DemoPass123!', role: Role.InventoryManager,
        },
      },
    },
  })
  @ApiDataResponse(StaffAccountResponseDto, HttpStatus.CREATED)
  @ApiBadRequestResponse({ description: 'Invalid account fields or role' })
  @ApiConflictResponse({ description: 'Email already registered' })
  create(@Body() input: CreateStaffAccountDto): Promise<StaffAccountResponseDto> {
    return this.admin.create(input);
  }

  @Get('staff')
  @ApiOperation({ summary: 'List Staff and Inventory Manager accounts' })
  @ApiPageResponse(StaffAccountResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination, role, or status filter' })
  list(@Query() query: StaffAccountQueryDto): Promise<Page<StaffAccountResponseDto>> {
    return this.admin.list(query);
  }

  @Get('staff/:id')
  @ApiOperation({ summary: 'Get a Staff or Inventory Manager account' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(StaffAccountResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid account ID' })
  @ApiNotFoundResponse({ description: 'Managed account not found' })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<StaffAccountResponseDto> {
    return this.admin.get(id);
  }

  @Patch('staff/:id')
  @ApiOperation({ summary: 'Update a managed account, including its role or active status' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({
    type: UpdateStaffAccountDto,
    examples: {
      transfer: { summary: 'Transfer to Inventory', value: { name: 'Inventory Lead', role: Role.InventoryManager } },
      reactivate: { summary: 'Reactivate an account', value: { isActive: true } },
    },
  })
  @ApiDataResponse(StaffAccountResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid account ID, fields, or role' })
  @ApiNotFoundResponse({ description: 'Managed account not found' })
  @ApiConflictResponse({ description: 'Email already registered' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateStaffAccountDto,
  ): Promise<StaffAccountResponseDto> {
    return this.admin.update(id, input);
  }

  @Delete('staff/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deactivate a managed account',
    description: 'Returns an empty 204 for both active and already inactive managed accounts.',
  })
  @ApiParam({
    name: 'id', schema: { type: 'string', format: 'uuid', example: '2c94ed93-9236-47af-a7c6-457452a4bf91' },
  })
  @ApiNoContentResponse({ description: 'Account inactive' })
  @ApiBadRequestResponse({ description: 'Invalid account ID' })
  @ApiNotFoundResponse({ description: 'Managed account not found' })
  deactivate(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    return this.admin.deactivate(id);
  }
}
