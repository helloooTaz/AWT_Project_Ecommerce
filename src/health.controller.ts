import { Controller, Get } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { ApiDataResponse } from './common/http/openapi';
import { Public } from './modules/auth/auth.decorators';

class HealthResponse {
  @ApiProperty({ example: 'ok' })
  status!: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiDataResponse(HealthResponse)
  health(): HealthResponse {
    return { status: 'ok' };
  }
}
