import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse, ApiPageResponse } from '../../common/http/openapi';
import { PageQueryDto, type Page } from '../../common/http/pagination';
import { Roles } from '../auth/auth.decorators';
import { Role } from '../auth/role';
import { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from './catalog.dto';
import { CatalogEntriesService } from './catalog-entries.service';

@ApiTags('Staff — Categories')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Staff or Admin role required' })
@Roles(Role.Staff, Role.Admin)
@Controller('staff/categories')
export class CategoriesController {
  constructor(private readonly catalog: CatalogEntriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  @ApiDataResponse(CategoryResponseDto, HttpStatus.CREATED)
  @ApiBadRequestResponse({ description: 'Invalid category fields' })
  @ApiConflictResponse({ description: 'Slug already exists' })
  create(@Body() input: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.catalog.createCategory(input);
  }

  @Get()
  @ApiOperation({ summary: 'List categories' })
  @ApiPageResponse(CategoryResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination' })
  list(@Query() query: PageQueryDto): Promise<Page<CategoryResponseDto>> {
    return this.catalog.listCategories(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(CategoryResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid category ID' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<CategoryResponseDto> {
    return this.catalog.getCategory(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(CategoryResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid category ID or fields' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'Slug already exists' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.catalog.updateCategory(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Category deleted' })
  @ApiBadRequestResponse({ description: 'Invalid category ID' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'Products still reference this category' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    return this.catalog.deleteCategory(id);
  }
}
