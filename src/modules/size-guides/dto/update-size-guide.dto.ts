import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { SizeGuideRangeDto } from './size-guide-range.dto';

export class UpdateSizeGuideDto {
  @ApiPropertyOptional({
    example: "Men's Tops Size Guide v2",
    minLength: 2,
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({
    description: 'Array of size measurement ranges (replaces existing ranges)',
    type: [SizeGuideRangeDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SizeGuideRangeDto)
  ranges?: SizeGuideRangeDto[];
}
