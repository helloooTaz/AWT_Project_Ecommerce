import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateReceiptDto {
  @ApiProperty({
    description: 'Product variant UUID to receive stock for',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({
    description:
      'Number of units received into warehouse (must be positive integer)',
    example: 50,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Optional supplier or shipment reference note',
    example: 'SUPPLIER_PO_98241',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
