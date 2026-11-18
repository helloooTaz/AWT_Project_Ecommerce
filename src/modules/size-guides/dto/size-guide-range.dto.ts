import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class SizeGuideRangeDto {
  @ApiProperty({ example: 'M', minLength: 1, maxLength: 32 })
  @IsString()
  @Length(1, 32)
  size!: string;

  @ApiPropertyOptional({ example: 170.0, minimum: 0.01, maximum: 9999.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  minHeightCm?: number;

  @ApiPropertyOptional({ example: 180.0, minimum: 0.01, maximum: 9999.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  maxHeightCm?: number;

  @ApiPropertyOptional({ example: 65.0, minimum: 0.01, maximum: 9999.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  minWeightKg?: number;

  @ApiPropertyOptional({ example: 75.0, minimum: 0.01, maximum: 9999.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  maxWeightKg?: number;

  @ApiPropertyOptional({ example: 96.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  minChestCm?: number;

  @ApiPropertyOptional({ example: 104.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  maxChestCm?: number;

  @ApiPropertyOptional({ example: 80.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  minWaistCm?: number;

  @ApiPropertyOptional({ example: 88.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  maxWaistCm?: number;

  @ApiPropertyOptional({ example: 98.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  minHipCm?: number;

  @ApiPropertyOptional({ example: 106.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  maxHipCm?: number;
}
