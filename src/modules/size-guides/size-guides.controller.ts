import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import { SizeGuidesService } from './size-guides.service';

@ApiTags('Size Guides')
@Controller('products/:productId/size-guide')
export class SizeGuidesController {
  constructor(private readonly sizeGuidesService: SizeGuidesService) {}

  @Get()
  @ApiOperation({
    summary: 'Public view of a product size guide with measurement brackets',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiOkResponse({ description: 'Size guide details and measurement ranges' })
  @ApiNotFoundResponse({ description: 'Size guide not found for this product' })
  async findByProduct(@Param('productId', ParseUUIDPipe) productId: string) {
    const guide = await this.sizeGuidesService.findByProductId(productId);
    return successResponse(guide, 'OK');
  }
}
