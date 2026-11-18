import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import { CatalogPriceTransformInterceptor } from '../../common/interceptors/catalog-price-transform.interceptor';
import { CatalogService } from './catalog.service';
import { ProductQueryDto } from './dto/product-query.dto';

@ApiTags('Catalog')
@UseInterceptors(CatalogPriceTransformInterceptor)
@Controller('products')
export class ProductsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @ApiOperation({
    summary:
      'Public published product catalog with search, filters and price formatting',
  })
  @ApiOkResponse({
    description: 'Paginated list of published products with active variants',
  })
  async findPublished(@Query() query: ProductQueryDto) {
    const result = await this.catalogService.findPublishedProducts(query);
    return successResponse(result.items, 'OK', result.pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get published product detail by ID' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiOkResponse({ description: 'Product details with active variants' })
  @ApiNotFoundResponse({ description: 'Published product not found' })
  async findPublishedById(@Param('id', ParseUUIDPipe) id: string) {
    const product = await this.catalogService.findPublishedProductById(id);
    return successResponse(product, 'OK');
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get published product detail by URL slug' })
  @ApiParam({ name: 'slug', description: 'Product slug' })
  @ApiOkResponse({ description: 'Product details with active variants' })
  @ApiNotFoundResponse({ description: 'Published product not found' })
  async findPublishedBySlug(@Param('slug') slug: string) {
    const product = await this.catalogService.findPublishedProductBySlug(slug);
    return successResponse(product, 'OK');
  }
}
