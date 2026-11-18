import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../roles/user-role.enum';
import { CollectionsService } from './collections.service';
import { CollectionQueryDto } from './dto/collection-query.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ManageCollectionProductDto } from './dto/manage-collection-product.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

@ApiTags('Staff - Collections')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Requires STAFF or ADMIN role' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN)
@Controller('staff/collections')
export class StaffCollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new collection' })
  @ApiCreatedResponse({ description: 'Collection created successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: 'Collection slug already exists' })
  async create(@Body() input: CreateCollectionDto) {
    const collection = await this.collectionsService.create(input);
    return successResponse(collection, 'Collection created');
  }

  @Get()
  @ApiOperation({ summary: 'List all collections (including inactive)' })
  @ApiOkResponse({ description: 'Paginated list of collections' })
  async findAll(@Query() query: CollectionQueryDto) {
    const result = await this.collectionsService.findAll(query);
    return successResponse(result.items, 'OK', result.pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get collection details with products' })
  @ApiParam({ name: 'id', description: 'Collection UUID' })
  @ApiOkResponse({ description: 'Collection details' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const collection = await this.collectionsService.findById(id);
    return successResponse(collection, 'OK');
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update collection' })
  @ApiParam({ name: 'id', description: 'Collection UUID' })
  @ApiOkResponse({ description: 'Collection updated successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  @ApiConflictResponse({ description: 'Collection slug already in use' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateCollectionDto,
  ) {
    const updated = await this.collectionsService.update(id, input);
    return successResponse(updated, 'Collection updated');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete collection' })
  @ApiParam({ name: 'id', description: 'Collection UUID' })
  @ApiOkResponse({ description: 'Collection deleted successfully' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.collectionsService.delete(id);
    return successResponse(result, 'Collection deleted');
  }

  @Post(':id/products')
  @ApiOperation({ summary: 'Add a product to this collection' })
  @ApiParam({ name: 'id', description: 'Collection UUID' })
  @ApiOkResponse({ description: 'Product added to collection' })
  @ApiNotFoundResponse({ description: 'Collection or product not found' })
  @ApiConflictResponse({ description: 'Product is already in this collection' })
  async addProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ManageCollectionProductDto,
  ) {
    const updated = await this.collectionsService.addProduct(
      id,
      input.productId,
    );
    return successResponse(updated, 'Product added to collection');
  }

  @Delete(':id/products/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a product from this collection' })
  @ApiParam({ name: 'id', description: 'Collection UUID' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiOkResponse({ description: 'Product removed from collection' })
  @ApiNotFoundResponse({
    description: 'Collection not found or product not in collection',
  })
  async removeProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    const updated = await this.collectionsService.removeProduct(id, productId);
    return successResponse(updated, 'Product removed from collection');
  }
}
