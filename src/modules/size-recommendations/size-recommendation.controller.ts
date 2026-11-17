import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import type { SizeRecommendationResponse } from './dto/size-recommendation-response';
import { SizeRecommendationDto } from './dto/size-recommendation.dto';
import { SizeRecommendationService } from './size-recommendation.service';

const example: SizeRecommendationResponse = {
  productId: '6268504d-c404-4730-9abb-9e8bd527f06a',
  status: 'RECOMMENDED',
  recommendedSize: 'M',
  bestFitSize: 'M',
  matchedMeasurements: ['height', 'weight', 'chest'],
  confidence: 'MODERATE',
  reason: 'Your compared measurements fall within this product’s size M range.',
  alternatives: ['L'],
  availableSizes: ['L', 'M'],
  variantAvailable: true,
  stockAvailable: true,
};

@ApiTags('Size recommendations')
@Controller('products/:productId/size-recommendation')
export class SizeRecommendationController {
  constructor(private readonly recommendations: SizeRecommendationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Estimate a size for a published product',
    description:
      'Public advisory estimate. Height and weight are required. Chest, waist and hip are optional.',
  })
  @ApiParam({ name: 'productId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({
    type: SizeRecommendationDto,
    examples: {
      basic: { value: { heightCm: 175, weightKg: 70 } },
      withChest: { value: { heightCm: 175, weightKg: 70, chestCm: 98 } },
    },
  })
  @ApiOkResponse({
    description:
      'Returns RECOMMENDED, NO_GUIDE, INSUFFICIENT_MEASUREMENTS, NO_MATCH or NO_ACTIVE_VARIANT. ' +
      'The last four outcomes have a null recommendedSize. bestFitSize can identify a match without an active variant. ' +
      'availableSizes and alternatives use active variant labels. stockAvailable reflects unreserved stock across colors of the recommended size.',
    schema: {
      example: {
        success: true,
        message: 'OK',
        data: example,
        meta: { requestId: 'ae1c8b3a-2341-4a74-a58a-5b30667b2220' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid product UUID or request measurements',
  })
  @ApiNotFoundResponse({ description: 'Published product not found' })
  async recommend(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: SizeRecommendationDto,
  ) {
    return successResponse(
      await this.recommendations.recommend(productId, input),
    );
  }
}
