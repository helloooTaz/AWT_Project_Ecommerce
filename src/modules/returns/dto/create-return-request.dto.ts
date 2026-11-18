import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

export class CreateReturnRequestDto {
  @ApiProperty({
    example: '11111111-1111-1111-1111-111111111111',
    description: 'Delivered Order UUID to request return for',
  })
  @IsUUID('4')
  orderId!: string;

  @ApiProperty({
    example: 'Item size M is slightly too large, request exchange or return.',
    minLength: 5,
    maxLength: 255,
  })
  @IsString()
  @Length(5, 255)
  reason!: string;
}
