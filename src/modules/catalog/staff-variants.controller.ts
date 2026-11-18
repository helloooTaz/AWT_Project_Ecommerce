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
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@ApiTags('Staff - Product Variants')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Requires STAFF or ADMIN role' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN)
@UseInterceptors(CatalogPriceTransformInterceptor)
@Controller('staff/products/:productId/variants')
export class StaffVariantsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @ApiOperation({
    summary: 'Add a new variant (size/color/SKU/price) to a product',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiCreatedResponse({ description: 'Variant created and audited' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: 'Variant SKU already exists' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async create(
    @StaffActor() actor: StaffActorContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: CreateVariantDto,
  ) {
    const variant = await this.catalogService.createVariant(
      actor.id,
      productId,
      input,
    );
    return successResponse(variant, 'Variant created');
  }

  @Get()
  @ApiOperation({ summary: 'List all variants for a product' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiOkResponse({ description: 'List of variants' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async findAll(@Param('productId', ParseUUIDPipe) productId: string) {
    const variants = await this.catalogService.findVariantsByProduct(productId);
    return successResponse(variants, 'OK');
  }

  @Get(':variantId')
  @ApiOperation({ summary: 'Get details of a specific variant' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiParam({ name: 'variantId', description: 'Variant UUID' })
  @ApiOkResponse({ description: 'Variant details' })
  @ApiNotFoundResponse({ description: 'Variant or product not found' })
  async findById(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    const variant = await this.catalogService.findVariantById(
      productId,
      variantId,
    );
    return successResponse(variant, 'OK');
  }

  @Patch(':variantId')
  @ApiOperation({
    summary:
      'Update a variant (price changes are automatically audited with before/after snapshots)',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiParam({ name: 'variantId', description: 'Variant UUID' })
  @ApiOkResponse({ description: 'Variant updated and audited' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: 'Variant SKU already in use' })
  @ApiNotFoundResponse({ description: 'Variant or product not found' })
  async update(
    @StaffActor() actor: StaffActorContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() input: UpdateVariantDto,
  ) {
    const updated = await this.catalogService.updateVariant(
      actor.id,
      productId,
      variantId,
      input,
    );
    return successResponse(updated, 'Variant updated');
  }

  @Delete(':variantId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a variant' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiParam({ name: 'variantId', description: 'Variant UUID' })
  @ApiOkResponse({ description: 'Variant deactivated and audited' })
  @ApiNotFoundResponse({ description: 'Variant or product not found' })
  async delete(
    @StaffActor() actor: StaffActorContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    const result = await this.catalogService.deleteVariant(
      actor.id,
      productId,
      variantId,
    );
    return successResponse(result, 'Variant deactivated');
  }
}
