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
  UseInterceptors,
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
import { CatalogPriceTransformInterceptor } from '../../common/interceptors/catalog-price-transform.interceptor';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  StaffActor,
  type StaffActorContext,
} from '../../common/decorators/staff-actor.decorator';
import { UserRole } from '../roles/user-role.enum';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('Staff - Products')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Requires STAFF or ADMIN role' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN)
@UseInterceptors(CatalogPriceTransformInterceptor)
@Controller('staff/products')
export class StaffProductsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a new product in DRAFT status with optional initial variants in one atomic transaction',
  })
  @ApiCreatedResponse({ description: 'Product created and audited' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({
    description: 'Product slug or variant SKU already exists',
  })
  @ApiNotFoundResponse({ description: 'Category or collection not found' })
  async create(
    @StaffActor() actor: StaffActorContext,
    @Body() input: CreateProductDto,
  ) {
    const product = await this.catalogService.createProduct(actor.id, input);
    return successResponse(product, 'Product created');
  }

  @Get()
  @ApiOperation({
    summary: 'List all products across all statuses with optional filters',
  })
  @ApiOkResponse({ description: 'Paginated list of products' })
  async findAll(@Query() query: ProductQueryDto) {
    const result = await this.catalogService.findStaffProducts(query);
    return successResponse(result.items, 'OK', result.pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full product details including all variants' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiOkResponse({ description: 'Product details' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const product = await this.catalogService.findProductById(id);
    return successResponse(product, 'OK');
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product information' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiOkResponse({ description: 'Product updated and audited' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({
    description: 'Product, category, or collection not found',
  })
  @ApiConflictResponse({ description: 'Product slug already in use' })
  async update(
    @StaffActor() actor: StaffActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProductDto,
  ) {
    const updated = await this.catalogService.updateProduct(
      actor.id,
      id,
      input,
    );
    return successResponse(updated, 'Product updated');
  }

  @Patch(':id/publish')
  @ApiOperation({
    summary:
      'Publish a product (validates that at least one active variant with a valid price exists)',
  })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiOkResponse({ description: 'Product published and audited' })
  @ApiBadRequestResponse({
    description:
      'Cannot publish product without active variants or valid prices',
  })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async publish(
    @StaffActor() actor: StaffActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const published = await this.catalogService.publishProduct(actor.id, id);
    return successResponse(published, 'Product published');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive (soft-delete) a product' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiOkResponse({ description: 'Product archived and audited' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async archive(
    @StaffActor() actor: StaffActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const archived = await this.catalogService.archiveProduct(actor.id, id);
    return successResponse(archived, 'Product archived');
  }
}
