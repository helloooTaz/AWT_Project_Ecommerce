import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { ProductStatus } from '../entities/product.entity';

export class UpdateProductDto {
  @ApiPropertyOptional({
    example: 'Relaxed Pure Linen Shirt',
    minLength: 2,
    maxLength: 160,
  })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @ApiPropertyOptional({
    example: 'relaxed-pure-linen-shirt',
    minLength: 2,
    maxLength: 160,
    description: 'URL-safe lowercase kebab-case slug',
  })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must be lowercase alphanumeric characters and single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({
    example: 'Updated product description.',
    minLength: 5,
  })
  @IsOptional()
  @IsString()
  @Length(5, 5000)
  description?: string;

  @ApiPropertyOptional({
    example: '11111111-1111-1111-1111-111111111111',
    description: 'Category UUID',
  })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Array of collection UUIDs (replaces current collection mappings)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  collectionIds?: string[];

  @ApiPropertyOptional({
    enum: ProductStatus,
    description: 'Product lifecycle status (DRAFT, PUBLISHED, ARCHIVED)',
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
