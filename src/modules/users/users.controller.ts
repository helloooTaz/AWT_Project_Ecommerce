import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Valid bearer token and active account required',
})
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current logged-in user profile' })
  @ApiOkResponse({
    description: 'Safe user profile',
    schema: {
      example: {
        success: true,
        message: 'OK',
        data: {
          id: '6268504d-c404-4730-9abb-9e8bd527f06a',
          email: 'user@example.com',
          fullName: 'Samira Rahman',
          role: 'CUSTOMER',
          status: 'ACTIVE',
          createdAt: '2026-11-12T08:00:00.000Z',
          updatedAt: '2026-11-12T08:00:00.000Z',
        },
        meta: { requestId: '6f2d7ea0-6df8-41f5-a28a-493bdaed806d' },
      },
    },
  })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return successResponse(await this.users.findProfileById(user.id));
  }
}
