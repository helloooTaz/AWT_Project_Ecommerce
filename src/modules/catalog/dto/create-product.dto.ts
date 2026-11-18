import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { CreateVariantDto } from './create-variant.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'Relaxed Linen Shirt', minLength: 2, maxLength: 160 })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiProperty({
    example: 'relaxed-linen-shirt',
    minLength: 2,
    maxLength: 160,
    description: 'URL-safe lowercase kebab-case slug',
  })
  @IsString()
  @Length(2, 160)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must be lowercase alphanumeric characters and single hyphens',
  })
  slug!: string;

  @ApiProperty({
    example: 'Breathable, lightweight 100% French linen tailored shirt.',
    minLength: 5,
  })
  @IsString()
  @Length(5, 5000)
  description!: string;

  @ApiProperty({
    example: '11111111-1111-1111-1111-111111111111',
    description: 'Category UUID',
  })
  @IsUUID('4')
  categoryId!: string;

  @ApiPropertyOptional({
    description: 'Array of collection UUIDs this product belongs to',
    type: [String],
    example: ['22222222-2222-2222-2222-222222222222'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  collectionIds?: string[];

  @ApiPropertyOptional({
    description:
      'Optional initial variants to create atomically with the product',
    type: [CreateVariantDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}
