import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateVariantDto {
  @ApiProperty({
    example: 'SHIRT-LINEN-WHT-M',
    minLength: 3,
    maxLength: 64,
    description: 'Unique Stock Keeping Unit (SKU) code',
  })
  @IsString()
  @Length(3, 64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'sku must contain only alphanumeric characters, underscores, and hyphens',
  })
  sku!: string;

  @ApiProperty({ example: 'M', minLength: 1, maxLength: 32 })
  @IsString()
  @Length(1, 32)
  size!: string;

  @ApiProperty({ example: 'White', minLength: 1, maxLength: 64 })
  @IsString()
  @Length(1, 64)
  color!: string;

  @ApiProperty({
    example: 250000,
    minimum: 0,
    description:
      'Price in BDT integer minor units (e.g. 250000 = 2,500.00 BDT)',
  })
  @IsInt()
  @Min(0)
  priceMinor!: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
