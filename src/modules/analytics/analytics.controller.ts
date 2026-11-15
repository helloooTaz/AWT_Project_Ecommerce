import { Controller, Get, UseGuards } from '@nestjs/common';
import {
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
import { AnalyticsService } from './analytics.service';

const analyticsSummaryExample = {
  users: {
    total: 25,
    active: 24,
    inactive: 1,
    byRole: {
      customer: 20,
      staff: 3,
      inventoryManager: 1,
      admin: 1,
    },
  },
  audit: {
    totalLogs: 42,
    recentActionsCount: 8,
  },
  system: {
    ordersCount: 15,
    productsCount: 10,
  },
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
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get high-level administrative platform metrics' })
  @ApiOkResponse({
    description: 'System-wide summary metrics for administrators',
    schema: {
      example: {
        success: true,
        message: 'OK',
        data: analyticsSummaryExample,
        meta: exampleMeta,
      },
    },
  })
  async getSummary() {
    return successResponse(await this.analytics.getSummary());
  }
}
