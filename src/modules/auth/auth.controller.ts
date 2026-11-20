import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse } from '../../common/http/openapi';
import { CurrentUser, Public } from './auth.decorators';
import { AuthResponseDto, LoginDto, RegisterDto, UserResponseDto } from './auth.dto';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './role';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiDataResponse(AuthResponseDto, 201)
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: 'Email already registered' })
  register(@Body() input: RegisterDto): Promise<AuthResponseDto> {
    return this.auth.register(input);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiDataResponse(AuthResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() input: LoginDto): Promise<AuthResponseDto> {
    return this.auth.login(input);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiDataResponse(UserResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
