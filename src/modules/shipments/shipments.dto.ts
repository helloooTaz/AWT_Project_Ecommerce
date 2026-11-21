import { ApiProperty } from '@nestjs/swagger';
import { ShipmentStatus } from '../../database/entities';

export class ShipmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty()
  carrier!: string;

  @ApiProperty()
  trackingNumber!: string;

  @ApiProperty({ enum: ShipmentStatus })
  status!: ShipmentStatus;

  @ApiProperty({ type: Date, nullable: true })
  shippedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  deliveredAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
