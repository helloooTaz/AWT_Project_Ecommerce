import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  NotEquals,
} from 'class-validator';

export class CreateAdjustmentDto {
  @ApiProperty({
    description: 'Product variant UUID to adjust stock for',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({
    description:
      'Quantity adjustment (positive to increase, negative to decrease; cannot be 0)',
    example: -2,
  })
  @IsInt()
  @NotEquals(0, { message: 'delta must not be zero' })
  delta!: number;

  @ApiProperty({
    description: 'Operational justification for adjustment',
    example: 'DAMAGED_IN_WAREHOUSE',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
