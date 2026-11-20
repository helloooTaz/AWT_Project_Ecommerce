import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse, ApiPageResponse } from '../../common/http/openapi';
import { type Page } from '../../common/http/pagination';
import { Roles } from '../auth/auth.decorators';
import { Role } from '../auth/role';
import { CreateVariantDto, UpdateVariantDto, VariantQueryDto, VariantResponseDto } from './catalog.dto';
import { VariantsService } from './variants.service';

@ApiTags('Staff — Variants')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Staff or Admin role required' })
@Roles(Role.Staff, Role.Admin)
@Controller('staff/variants')
export class VariantsController {
  constructor(private readonly catalog: VariantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a variant' })
  @ApiDataResponse(VariantResponseDto, HttpStatus.CREATED)
  @ApiBadRequestResponse({ description: 'Invalid variant fields' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'SKU or product option already exists, or a related record changed' })
  create(@Body() input: CreateVariantDto): Promise<VariantResponseDto> {
    return this.catalog.create(input);
  }

  @Get()
  @ApiOperation({ summary: 'List variants' })
  @ApiPageResponse(VariantResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination or filter' })
  list(@Query() query: VariantQueryDto): Promise<Page<VariantResponseDto>> {
    return this.catalog.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a variant' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(VariantResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid variant ID' })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<VariantResponseDto> {
    return this.catalog.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a variant' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(VariantResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid variant ID or fields' })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  @ApiConflictResponse({ description: 'SKU or product option already exists, or a related record changed' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateVariantDto,
  ): Promise<VariantResponseDto> {
    return this.catalog.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a variant' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Variant deleted' })
  @ApiBadRequestResponse({ description: 'Invalid variant ID' })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  @ApiConflictResponse({ description: 'Variant has stock, related records, or a concurrent operation' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    return this.catalog.remove(id);
  }
}
