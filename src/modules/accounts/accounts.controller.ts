import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { AccountsService } from './accounts.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Update your profile' })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        message: 'OK',
        data: {
          id: '6268504d-c404-4730-9abb-9e8bd527f06a',
          fullName: 'Samira Rahman',
        },
        meta: { requestId: '6f2d7ea0-6df8-41f5-a28a-493bdaed806d' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Missing, invalid or restricted fields',
  })
  @ApiUnauthorizedResponse({
    description: 'Valid bearer token and active account required',
  })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateProfileDto,
  ) {
    return successResponse(
      await this.accounts.updateProfile(user.id, input.fullName),
    );
  }
}
