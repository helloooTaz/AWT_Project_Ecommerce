import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { successResponse } from './common/dto/success-response';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check whether the API is running' })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        message: 'OK',
        data: { status: 'ok' },
        meta: { requestId: 'c84ebc91-bf19-42fd-9a0d-41c79cd7a961' },
      },
    },
  })
  check() {
    return successResponse({ status: 'ok' });
  }
}
