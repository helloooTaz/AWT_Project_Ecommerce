import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiDataResponse, ApiPageResponse } from '../../common/http/openapi';
import type { Page } from '../../common/http/pagination';
import { Public } from '../auth/auth.decorators';
import { PublicProductDto, PublicProductQueryDto } from './catalog.dto';
import { ProductsService } from './products.service';

@ApiTags('Public Catalog')
@Public()
@Controller('products')
export class PublicCatalogController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse active products and their active variants' })
  @ApiPageResponse(PublicProductDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination or category filter' })
  list(@Query() query: PublicProductQueryDto): Promise<Page<PublicProductDto>> {
    return this.products.listPublic(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an active product and its current variant prices' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(PublicProductDto)
  @ApiBadRequestResponse({ description: 'Invalid product ID' })
  @ApiNotFoundResponse({ description: 'Active product not found' })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<PublicProductDto> {
    return this.products.getPublic(id);
  }
}
