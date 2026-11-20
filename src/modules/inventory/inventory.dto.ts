import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Max, Min, NotContains, NotEquals, ValidateIf } from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination';
import { MovementType } from '../../database/entities/inventory.entity';

export const MAX_STOCK = 2_147_483_647;
const MIN_DELTA = -2_147_483_648;
const exampleVariantId = 'aac08cc3-a4a6-4db5-84a2-946208da4741';

export class InventoryPageQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filter by exact variant ID' })
  @ValidateIf((_input, value) => value !== undefined)
  @IsUUID('4')
  variantId?: string;
}

class StockChangeInputDto {
  @ApiProperty({ format: 'uuid', example: exampleVariantId })
  @IsUUID('4')
  variantId!: string;

  @ApiProperty({ minLength: 1, maxLength: 240, example: 'Inventory count correction' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 240)
  @NotContains('\0', { message: 'reason must not contain a null character' })
  reason!: string;
}

export class ReceiveStockDto extends StockChangeInputDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: MAX_STOCK, example: 10 })
  @IsInt()
  @Min(1)
  @Max(MAX_STOCK)
  quantity!: number;
}

export class AdjustStockDto extends StockChangeInputDto {
  @ApiProperty({
    type: 'integer', minimum: MIN_DELTA, maximum: MAX_STOCK,
    example: -2, description: 'Signed quantity change. Zero is invalid.',
  })
  @IsInt()
  @Min(MIN_DELTA)
  @Max(MAX_STOCK)
  @NotEquals(0)
  delta!: number;
}

export class StockBalanceDto {
  @ApiProperty({ format: 'uuid', example: exampleVariantId })
  variantId!: string;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: MAX_STOCK, example: 8 })
  quantity!: number;
}

export class StockResponseDto extends StockBalanceDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'LINEN-M-BLACK' })
  sku!: string;

  @ApiProperty({ example: 'Linen shirt' })
  productName!: string;

  @ApiProperty({ example: 'M' })
  size!: string;

  @ApiProperty({ example: 'black' })
  color!: string;
}

export class MovementResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  variantId!: string;

  @ApiProperty({ format: 'uuid' })
  actorId!: string;

  @ApiProperty({ enum: MovementType, enumName: 'MovementType' })
  type!: MovementType;

  @ApiProperty({ type: 'integer', example: -2 })
  delta!: number;

  @ApiProperty({ example: 'Damaged items' })
  reason!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class StockChangeResponseDto extends StockBalanceDto {
  @ApiProperty({ type: () => MovementResponseDto })
  movement!: MovementResponseDto;
}
