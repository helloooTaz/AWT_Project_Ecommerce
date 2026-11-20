import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse, ApiPageResponse } from '../../common/http/openapi';
import { PageQueryDto, type Page } from '../../common/http/pagination';
import { Roles } from '../auth/auth.decorators';
import { Role } from '../auth/role';
import { CollectionResponseDto, CreateCollectionDto, UpdateCollectionDto } from './catalog.dto';
import { CatalogEntriesService } from './catalog-entries.service';

@ApiTags('Staff — Collections')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Staff or Admin role required' })
@Roles(Role.Staff, Role.Admin)
@Controller('staff/collections')
export class CollectionsController {
  constructor(private readonly catalog: CatalogEntriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a collection' })
  @ApiDataResponse(CollectionResponseDto, HttpStatus.CREATED)
  @ApiBadRequestResponse({ description: 'Invalid collection fields' })
  @ApiConflictResponse({ description: 'Slug already exists' })
  create(@Body() input: CreateCollectionDto): Promise<CollectionResponseDto> {
    return this.catalog.createCollection(input);
  }

  @Get()
  @ApiOperation({ summary: 'List collections' })
  @ApiPageResponse(CollectionResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination' })
  list(@Query() query: PageQueryDto): Promise<Page<CollectionResponseDto>> {
    return this.catalog.listCollections(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a collection' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(CollectionResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid collection ID' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<CollectionResponseDto> {
    return this.catalog.getCollection(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a collection' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(CollectionResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid collection ID or fields' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  @ApiConflictResponse({ description: 'Slug already exists' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.catalog.updateCollection(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a collection' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Collection deleted' })
  @ApiBadRequestResponse({ description: 'Invalid collection ID' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  @ApiConflictResponse({ description: 'A related record prevents deletion' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    return this.catalog.deleteCollection(id);
  }
}
