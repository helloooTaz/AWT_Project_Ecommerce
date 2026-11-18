import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import { CategoriesService } from './categories.service';
import { CategoryQueryDto } from './dto/category-query.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Public list of categories' })
  @ApiOkResponse({ description: 'Paginated list of active categories' })
  async findAll(@Query() query: CategoryQueryDto) {
    const defaultQuery = {
      ...query,
      isActive: query.isActive !== undefined ? query.isActive : true,
    };
    const result = await this.categoriesService.findAll(defaultQuery);
    return successResponse(result.items, 'OK', result.pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiOkResponse({ description: 'Category details' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const category = await this.categoriesService.findById(id);
    return successResponse(category, 'OK');
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get category by URL slug' })
  @ApiParam({ name: 'slug', description: 'Category slug' })
  @ApiOkResponse({ description: 'Category details' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  async findBySlug(@Param('slug') slug: string) {
    const category = await this.categoriesService.findBySlug(slug);
    return successResponse(category, 'OK');
  }
}
