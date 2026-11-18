import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class CreateCollectionDto {
  @ApiProperty({ example: 'Summer 2026', minLength: 2, maxLength: 120 })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({
    example: 'summer-2026',
    minLength: 2,
    maxLength: 120,
    description: 'URL-safe lowercase kebab-case slug',
  })
  @IsString()
  @Length(2, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must be lowercase alphanumeric characters and single hyphens',
  })
  slug!: string;

  @ApiPropertyOptional({
    example:
      'Breathable natural fibers and relaxed silhouettes for warm climates.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Optional array of product UUIDs to assign to this collection',
    type: [String],
    example: ['11111111-1111-1111-1111-111111111111'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];
}
