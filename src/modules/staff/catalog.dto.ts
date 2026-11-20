import { ApiProperty, ApiPropertyOptional, OmitType, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique, IsArray, IsBoolean, IsInt, IsString, IsUUID, Length, Matches, Max, Min, NotContains, ValidateIf,
} from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination';

const MAX_PRICE_MINOR = 2_147_483_647;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateCategoryDto {
  @ApiProperty({ example: 'Linen shirts', minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  @NotContains('\0')
  name!: string;

  @ApiProperty({ example: 'linen-shirts', minLength: 1, maxLength: 120, pattern: slugPattern.source })
  @IsString()
  @Length(1, 120)
  @Matches(slugPattern, { message: 'slug must contain lowercase letters and digits separated by hyphens' })
  slug!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Lightweight everyday shirts' })
  @ValidateIf((_input, value) => value !== undefined && value !== null)
  @IsString()
  @NotContains('\0')
  description?: string | null;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto, { skipNullProperties: false }) {}

export class CreateCollectionDto extends CreateCategoryDto {
  @ApiPropertyOptional({ default: true, example: true })
  @ValidateIf((_input, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCollectionDto extends PartialType(CreateCollectionDto, { skipNullProperties: false }) {}

export class CreateProductDto extends CreateCategoryDto {
  @ApiProperty({ format: 'uuid', example: 'f2068dbe-d4f0-4e5f-9b51-2b3d811d31cb' })
  @IsUUID('4')
  categoryId!: string;

  @ApiPropertyOptional({
    type: 'array', items: { type: 'string', format: 'uuid' },
    example: ['7230760b-5cb7-4b55-823b-72cbc62e2e0a'],
    description: 'Collection IDs. An empty array clears membership.',
  })
  @ValidateIf((_input, value) => value !== undefined)
  @IsArray()
  @ArrayUnique((value: unknown) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID('4', { each: true })
  collectionIds?: string[];

  @ApiPropertyOptional({ default: true, example: false })
  @ValidateIf((_input, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto, { skipNullProperties: false }) {}

export class CreateVariantDto {
  @ApiProperty({ format: 'uuid', example: 'a02bf259-57d6-4c38-978c-be3b3adcdf16' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ example: 'LINEN-M-BLACK', minLength: 1, maxLength: 64 })
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  @NotContains('\0')
  sku!: string;

  @ApiProperty({ example: 'M', minLength: 1, maxLength: 32 })
  @Transform(trim)
  @IsString()
  @Length(1, 32)
  @NotContains('\0')
  size!: string;

  @ApiProperty({ example: 'Black', minLength: 1, maxLength: 48 })
  @Transform(trim)
  @IsString()
  @Length(1, 48)
  @NotContains('\0')
  color!: string;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: MAX_PRICE_MINOR, example: 120000 })
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_MINOR)
  priceMinor!: number;

  @ApiPropertyOptional({ default: true, example: true })
  @ValidateIf((_input, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVariantDto extends PartialType(OmitType(CreateVariantDto, ['productId']), {
  skipNullProperties: false,
}) {}

export class PublicProductQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((_input, value) => value !== undefined)
  @IsUUID('4')
  categoryId?: string;
}

export class ProductQueryDto extends PublicProductQueryDto {
  @ApiPropertyOptional({ type: Boolean, example: false })
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @ValidateIf((_input, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class VariantQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((_input, value) => value !== undefined)
  @IsUUID('4')
  productId?: string;
}

class CatalogRecordDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class CategoryResponseDto extends CatalogRecordDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
}

export class CollectionResponseDto extends CategoryResponseDto {
  @ApiProperty()
  isActive!: boolean;
}

export class ProductResponseDto extends CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty({ type: 'array', items: { type: 'string', format: 'uuid' } })
  collectionIds!: string[];

  @ApiProperty()
  isActive!: boolean;
}

export class VariantResponseDto extends CatalogRecordDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  size!: string;

  @ApiProperty()
  color!: string;

  @ApiProperty({ type: 'integer', minimum: 0, example: 120000 })
  priceMinor!: number;

  @ApiProperty()
  isActive!: boolean;
}

export class PublicCategoryDto extends PickType(CategoryResponseDto, ['id', 'name', 'slug']) {}

export class PublicVariantDto extends PickType(VariantResponseDto, ['id', 'sku', 'size', 'color', 'priceMinor']) {}

export class PublicProductDto extends PickType(CategoryResponseDto, ['id', 'name', 'slug', 'description']) {
  @ApiProperty({ type: () => PublicCategoryDto })
  category!: PublicCategoryDto;

  @ApiProperty({ type: () => PublicVariantDto, isArray: true })
  variants!: PublicVariantDto[];
}
