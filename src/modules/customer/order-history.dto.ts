import { ApiProperty } from '@nestjs/swagger';
import type { Order } from '../../database/entities';
import type { ShippingAddress } from '../../database/entities/address.entity';
import { CreateAddressDto } from './customer.dto';

export class OrderSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: 'integer', minimum: 0, description: 'Stored order total in BDT poisha' })
  totalMinor!: number;
}

export class OrderShippingAddressDto extends CreateAddressDto implements ShippingAddress {
  @ApiProperty({ type: String, nullable: true, minLength: 1, maxLength: 200 })
  declare line2: string | null;
}

export class OrderItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  variantId!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  size!: string;

  @ApiProperty()
  color!: string;

  @ApiProperty({ type: 'integer', minimum: 1 })
  quantity!: number;

  @ApiProperty({ type: 'integer', minimum: 0, description: 'Stored unit price in BDT poisha' })
  unitPriceMinor!: number;
}

export class OrderDetailDto extends OrderSummaryDto {
  @ApiProperty({ type: () => OrderShippingAddressDto })
  shippingAddress!: OrderShippingAddressDto;

  @ApiProperty({ type: () => OrderItemResponseDto, isArray: true })
  items!: OrderItemResponseDto[];
}

export function toOrderDetail(order: Order): OrderDetailDto {
  return {
    id: order.id,
    createdAt: order.createdAt,
    totalMinor: order.totalMinor,
    shippingAddress: order.shippingAddress,
    items: order.items.map(({ id, variantId, sku, productName, size, color, quantity, unitPriceMinor }) => ({
      id, variantId, sku, productName, size, color, quantity, unitPriceMinor,
    })),
  };
}
