import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateShipmentDto {
  @ApiProperty({
    description: 'Logistics / courier carrier name',
    example: 'Pathao',
  })
  @IsString()
  @IsNotEmpty()
  carrier!: string;

  @ApiPropertyOptional({
    description: 'Courier tracking number (generated automatically if omitted)',
    example: 'PTH-984218-BD',
  })
  @IsOptional()
  @IsString()
  trackingNumber?: string;
}
