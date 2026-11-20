import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse, ApiPageResponse } from '../../common/http/openapi';
import { type Page } from '../../common/http/pagination';
import { Roles } from '../auth/auth.decorators';
import { Role } from '../auth/role';
import { CreateProductDto, ProductQueryDto, ProductResponseDto, UpdateProductDto } from './catalog.dto';
import { ProductsService } from './products.service';

@ApiTags('Staff — Products')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Staff or Admin role required' })
@Roles(Role.Staff, Role.Admin)
@Controller('staff/products')
export class ProductsController {
  constructor(private readonly catalog: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  @ApiDataResponse(ProductResponseDto, HttpStatus.CREATED)
  @ApiBadRequestResponse({ description: 'Invalid product fields' })
  @ApiNotFoundResponse({ description: 'Category or collection not found' })
  @ApiConflictResponse({ description: 'Slug already exists or a related record changed' })
  create(@Body() input: CreateProductDto): Promise<ProductResponseDto> {
    return this.catalog.create(input);
  }

  @Get()
  @ApiOperation({ summary: 'List products' })
  @ApiPageResponse(ProductResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination or filter' })
  list(@Query() query: ProductQueryDto): Promise<Page<ProductResponseDto>> {
    return this.catalog.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(ProductResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid product ID' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<ProductResponseDto> {
    return this.catalog.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(ProductResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid product ID or fields' })
  @ApiNotFoundResponse({ description: 'Product, category, or collection not found' })
  @ApiConflictResponse({ description: 'Slug already exists or a related record changed' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.catalog.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Product deleted' })
  @ApiBadRequestResponse({ description: 'Invalid product ID' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'Variants still reference this product' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    return this.catalog.remove(id);
  }
}
