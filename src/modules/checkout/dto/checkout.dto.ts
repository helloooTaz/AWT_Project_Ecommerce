import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({
    format: 'uuid',
    example: '6268504d-c404-4730-9abb-9e8bd527f06a',
  })
  @IsUUID()
  addressId!: string;
}
