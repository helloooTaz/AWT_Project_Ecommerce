import {
  Body,
  Controller,
  Delete,
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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UserRole } from '../roles/user-role.enum';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffQueryDto } from './dto/staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UserStatus } from './entities/user.entity';
import { UsersService } from './users.service';

const staffExample = {
  id: '7f938d21-41be-4da5-a9a3-5c7ff26b7c43',
  email: 'staff.member@thread.local',
  fullName: 'Operational Staff',
  role: UserRole.STAFF,
  status: UserStatus.ACTIVE,
  createdAt: '2026-11-16T08:00:00.000Z',
  updatedAt: '2026-11-16T08:00:00.000Z',
};

const exampleMeta = {
  requestId: '6f2d7ea0-6df8-41f5-a28a-493bdaed806d',
};

@ApiTags('Admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Admin role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.ADMIN])
@Controller('admin/staff')
export class StaffController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new staff or inventory manager account' })
  @ApiCreatedResponse({
    description: 'Staff account created and audited',
    schema: {
      example: {
        success: true,
        message: 'Staff account created',
        data: staffExample,
        meta: exampleMeta,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: 'Email already registered' })
  async createStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateStaffDto,
  ) {
    const created = await this.users.createStaff(user.id, input);
    return successResponse(created, 'Staff account created');
  }

  @Get()
  @ApiOperation({ summary: 'Paginated list of staff members' })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  @ApiOkResponse({
    description: 'Paginated staff list',
    schema: {
      example: {
        success: true,
        message: 'OK',
        data: [staffExample],
        meta: {
          ...exampleMeta,
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      },
    },
  })
  async listStaff(@Query() query: StaffQueryDto) {
    const { staff, pagination } = await this.users.listStaff(query);
    return successResponse(staff, 'OK', pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get staff member detail by UUID' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiBadRequestResponse({ description: 'Invalid staff UUID' })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @ApiOkResponse({
    description: 'Staff detail',
    schema: {
      example: {
        success: true,
        message: 'OK',
        data: staffExample,
        meta: exampleMeta,
      },
    },
  })
  async getStaff(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return successResponse(await this.users.findStaffById(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update staff member profile, role, or status' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @ApiOkResponse({
    description: 'Staff member updated and audited',
    schema: {
      example: {
        success: true,
        message: 'Staff member updated',
        data: staffExample,
        meta: exampleMeta,
      },
    },
  })
  async updateStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateStaffDto,
  ) {
    const updated = await this.users.updateStaff(user.id, id, input);
    return successResponse(updated, 'Staff member updated');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate (soft-delete) a staff member' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiBadRequestResponse({ description: 'Invalid staff UUID' })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @ApiOkResponse({
    description: 'Staff member deactivated and audited',
    schema: {
      example: {
        success: true,
        message: 'Staff member deactivated',
        data: { ...staffExample, status: UserStatus.INACTIVE },
        meta: exampleMeta,
      },
    },
  })
  async deactivateStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const deactivated = await this.users.deactivateStaff(user.id, id);
    return successResponse(deactivated, 'Staff member deactivated');
  }
}
