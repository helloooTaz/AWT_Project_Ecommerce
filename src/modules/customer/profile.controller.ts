import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiOperation,
  ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse } from '../../common/http/openapi';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { UserResponseDto } from '../auth/auth.dto';
import { Role, type AuthenticatedUser } from '../auth/role';
import { UpdateProfileDto } from './customer.dto';
import { ProfileService } from './profile.service';

@ApiTags('Customer profile')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Customer role required' })
@Roles(Role.Customer)
@Controller('customers/me')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get the signed-in customer profile' })
  @ApiDataResponse(UserResponseDto)
  get(@CurrentUser() user: AuthenticatedUser): UserResponseDto {
    return user;
  }

  @Patch()
  @ApiOperation({ summary: 'Update the signed-in customer name' })
  @ApiDataResponse(UserResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid name or unexpected fields' })
  @ApiUnauthorizedResponse({ description: 'Invalid authentication or account is unavailable' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.profiles.updateName(user.id, input.name);
  }
}
