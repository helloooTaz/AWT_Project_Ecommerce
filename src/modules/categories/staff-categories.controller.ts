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
import { CategoriesService } from './categories.service';
import { CategoryQueryDto } from './dto/category-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Staff - Categories')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Requires STAFF or ADMIN role' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN)
@Controller('staff/categories')
export class StaffCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new category' })
  @ApiCreatedResponse({ description: 'Category created successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: 'Category slug already exists' })
  async create(@Body() input: CreateCategoryDto) {
    const category = await this.categoriesService.create(input);
    return successResponse(category, 'Category created');
  }

  @Get()
  @ApiOperation({ summary: 'List all categories (including inactive)' })
  @ApiOkResponse({ description: 'Paginated list of categories' })
  async findAll(@Query() query: CategoryQueryDto) {
    const result = await this.categoriesService.findAll(query);
    return successResponse(result.items, 'OK', result.pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category details by ID' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiOkResponse({ description: 'Category details' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const category = await this.categoriesService.findById(id);
    return successResponse(category, 'OK');
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update category' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiOkResponse({ description: 'Category updated successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'Category slug already in use' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateCategoryDto,
  ) {
    const updated = await this.categoriesService.update(id, input);
    return successResponse(updated, 'Category updated');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete category (if no products are linked)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiOkResponse({ description: 'Category deleted successfully' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({
    description: 'Cannot delete category with assigned products',
  })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.categoriesService.delete(id);
    return successResponse(result, 'Category deleted');
  }
}
