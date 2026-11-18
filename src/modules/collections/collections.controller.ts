import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import { CollectionsService } from './collections.service';
import { CollectionQueryDto } from './dto/collection-query.dto';

@ApiTags('Collections')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  @ApiOperation({ summary: 'Public list of collections' })
  @ApiOkResponse({ description: 'Paginated list of active collections' })
  async findAll(@Query() query: CollectionQueryDto) {
    const defaultQuery = {
      ...query,
      isActive: query.isActive !== undefined ? query.isActive : true,
    };
    const result = await this.collectionsService.findAll(defaultQuery);
    return successResponse(result.items, 'OK', result.pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get collection with products by ID' })
  @ApiParam({ name: 'id', description: 'Collection UUID' })
  @ApiOkResponse({ description: 'Collection details' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const collection = await this.collectionsService.findById(id);
    return successResponse(collection, 'OK');
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get collection with products by URL slug' })
  @ApiParam({ name: 'slug', description: 'Collection slug' })
  @ApiOkResponse({ description: 'Collection details' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  async findBySlug(@Param('slug') slug: string) {
    const collection = await this.collectionsService.findBySlug(slug);
    return successResponse(collection, 'OK');
  }
}
