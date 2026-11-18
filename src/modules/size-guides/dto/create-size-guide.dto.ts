import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { SizeGuideRangeDto } from './size-guide-range.dto';

export class CreateSizeGuideDto {
  @ApiProperty({
    example: "Men's Tops Size Guide",
    minLength: 2,
    maxLength: 120,
  })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({
    description: 'Array of size measurement ranges',
    type: [SizeGuideRangeDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SizeGuideRangeDto)
  ranges!: SizeGuideRangeDto[];
}
