import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination';
import { OrderStatus } from '../../database/entities';

export class FulfillmentQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus, description: 'Filter by order status' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

export class FulfillmentOrderSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  customerEmail!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ type: 'integer', minimum: 0, description: 'Stored order total in BDT poisha' })
  totalMinor!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  itemCount!: number;

  @ApiProperty()
  createdAt!: Date;
}

export class CreateShipmentDto {
  @ApiProperty({ example: 'Pathao', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  carrier!: string;

  @ApiPropertyOptional({ example: 'TRK-12345-ABC', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trackingNumber?: string;
}

export class PackOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;
}
