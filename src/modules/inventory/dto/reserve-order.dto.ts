import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReserveOrderItemDto {
  @ApiProperty({
    description: 'Unique order item UUID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID('4')
  @IsNotEmpty()
  orderItemId!: string;

  @ApiProperty({
    description: 'Product variant UUID to reserve',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID('4')
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({
    description: 'Quantity to reserve (must be positive integer)',
    example: 2,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ReserveForOrderDto {
  @ApiProperty({
    description: 'Order UUID',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  @IsUUID('4')
  @IsNotEmpty()
  orderId!: string;

  @ApiProperty({
    description: 'Items to reserve',
    type: [ReserveOrderItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReserveOrderItemDto)
  items!: ReserveOrderItemDto[];

  @ApiProperty({
    description: 'Expiration timestamp for the reservation',
    example: '2026-11-13T12:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  expiresAt!: Date;
}
