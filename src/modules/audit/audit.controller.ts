import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UserRole } from '../roles/user-role.enum';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

const auditLogExample = {
  id: '3c8524d7-fcbd-4dbb-bfa1-df393b95a024',
  actorId: '6268504d-c404-4730-9abb-9e8bd527f06a',
  action: 'STAFF_CREATED',
  entity: 'users',
  entityId: '7f938d21-41be-4da5-a9a3-5c7ff26b7c43',
  before: null,
  after: {
    email: 'staff@thread.local',
    fullName: 'Operational Staff',
    role: 'STAFF',
    status: 'ACTIVE',
  },
  createdAt: '2026-11-16T08:00:00.000Z',
  actor: {
    id: '6268504d-c404-4730-9abb-9e8bd527f06a',
    email: 'admin@thread.local',
    fullName: 'System Administrator',
    role: 'ADMIN',
  },
};

const exampleMeta = {
  requestId: '6f2d7ea0-6df8-41f5-a28a-493bdaed806d',
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

@ApiTags('Admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Admin role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.ADMIN])
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated list of system audit log entries' })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  @ApiOkResponse({
    description: 'Paginated audit logs with actor and state transitions',
    schema: {
      example: {
        success: true,
        message: 'OK',
        data: [auditLogExample],
        meta: exampleMeta,
      },
    },
  })
  async listLogs(@Query() query: AuditLogQueryDto) {
    const { logs, pagination } = await this.audit.list(query);
    return successResponse(logs, 'OK', pagination);
  }
}
