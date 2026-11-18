import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { CreateSizeGuideDto } from './dto/create-size-guide.dto';
import { UpdateSizeGuideDto } from './dto/update-size-guide.dto';
import { SizeGuidesService } from './size-guides.service';

@ApiTags('Staff - Size Guides')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Requires STAFF or ADMIN role' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN)
@Controller('staff/products/:productId/size-guide')
export class StaffSizeGuidesController {
  constructor(private readonly sizeGuidesService: SizeGuidesService) {}

  @Get()
  @ApiOperation({ summary: 'Get configured size guide for a product' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiOkResponse({ description: 'Size guide with measurement ranges' })
  @ApiNotFoundResponse({ description: 'Size guide not found' })
  async findByProduct(@Param('productId', ParseUUIDPipe) productId: string) {
    const guide = await this.sizeGuidesService.findByProductId(productId);
    return successResponse(guide, 'OK');
  }

  @Post()
  @ApiOperation({
    summary:
      'Configure size guide and measurement brackets for a product in an atomic transaction',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiCreatedResponse({ description: 'Size guide created successfully' })
  @ApiBadRequestResponse({
    description: 'Validation failed or invalid range bounds',
  })
  @ApiConflictResponse({
    description: 'Product already has a size guide configured',
  })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: CreateSizeGuideDto,
  ) {
    const created = await this.sizeGuidesService.create(productId, input);
    return successResponse(created, 'Size guide created');
  }

  @Put()
  @ApiOperation({
    summary: 'Update size guide name and/or replace measurement ranges',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiOkResponse({ description: 'Size guide updated successfully' })
  @ApiBadRequestResponse({
    description: 'Validation failed or invalid range bounds',
  })
  @ApiNotFoundResponse({ description: 'Size guide or product not found' })
  async update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: UpdateSizeGuideDto,
  ) {
    const updated = await this.sizeGuidesService.update(productId, input);
    return successResponse(updated, 'Size guide updated');
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete size guide and its measurement ranges' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiOkResponse({ description: 'Size guide deleted successfully' })
  @ApiNotFoundResponse({ description: 'Size guide not found' })
  async delete(@Param('productId', ParseUUIDPipe) productId: string) {
    const result = await this.sizeGuidesService.delete(productId);
    return successResponse(result, 'Size guide deleted');
  }
}
