import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiCreatedResponse({ description: 'Customer registered' })
  @ApiConflictResponse({ description: 'Email already registered' })
  async register(@Body() input: RegisterDto) {
    return successResponse(
      await this.auth.register(input),
      'Customer registered',
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Bearer access token in data.accessToken' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async login(@Body() input: LoginDto) {
    return successResponse(await this.auth.login(input));
  }
}
