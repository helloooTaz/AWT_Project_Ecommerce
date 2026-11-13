import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, Max, Min, ValidateIf } from 'class-validator';

export class SizeRecommendationDto {
  @ApiProperty({ minimum: 50, maximum: 260, example: 175 })
  @IsNumber()
  @Min(50)
  @Max(260)
  heightCm!: number;

  @ApiProperty({ minimum: 10, maximum: 500, example: 70 })
  @IsNumber()
  @Min(10)
  @Max(500)
  weightKg!: number;

  @ApiPropertyOptional({ minimum: 30, maximum: 300, example: 98 })
  @ValidateIf((_body, value) => value !== undefined)
  @IsNumber()
  @Min(30)
  @Max(300)
  chestCm?: number;

  @ApiPropertyOptional({ minimum: 30, maximum: 300, example: 82 })
  @ValidateIf((_body, value) => value !== undefined)
  @IsNumber()
  @Min(30)
  @Max(300)
  waistCm?: number;

  @ApiPropertyOptional({ minimum: 30, maximum: 300, example: 100 })
  @ValidateIf((_body, value) => value !== undefined)
  @IsNumber()
  @Min(30)
  @Max(300)
  hipCm?: number;
}
