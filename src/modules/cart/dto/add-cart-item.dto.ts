import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { UpdateCartItemDto } from './update-cart-item.dto';

export class AddCartItemDto extends UpdateCartItemDto {
  @ApiProperty({
    format: 'uuid',
    example: '6268504d-c404-4730-9abb-9e8bd527f06a',
  })
  @IsUUID()
  variantId!: string;
}
