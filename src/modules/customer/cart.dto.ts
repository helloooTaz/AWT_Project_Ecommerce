import { ApiProperty } from '@nestjs/swagger';

export class CartItemResponseDto {
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

  @ApiProperty({ type: 'integer', minimum: 0, description: 'Current unit price in BDT poisha' })
  unitPriceMinor!: number;

  @ApiProperty({ description: 'Whether both the variant and its product are active' })
  available!: boolean;
}

export class CartResponseDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  id!: string | null;

  @ApiProperty({ type: () => CartItemResponseDto, isArray: true })
  items!: CartItemResponseDto[];

  @ApiProperty({ type: 'integer', minimum: 0, description: 'Total for available items in BDT poisha' })
  totalMinor!: number;
}
