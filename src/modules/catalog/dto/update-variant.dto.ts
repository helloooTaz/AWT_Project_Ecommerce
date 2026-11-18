import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class UpdateVariantDto {
  @ApiPropertyOptional({
    example: 'SHIRT-LINEN-WHT-M-V2',
    minLength: 3,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @Length(3, 64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'sku must contain only alphanumeric characters, underscores, and hyphens',
  })
  sku?: string;

  @ApiPropertyOptional({ example: 'M', minLength: 1, maxLength: 32 })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  size?: string;

  @ApiPropertyOptional({ example: 'Off-White', minLength: 1, maxLength: 64 })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  color?: string;

  @ApiPropertyOptional({
    example: 275000,
    minimum: 0,
    description: 'Price in BDT integer minor units',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinor?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
