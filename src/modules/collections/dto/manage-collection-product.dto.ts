import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ManageCollectionProductDto {
  @ApiProperty({
    example: '11111111-1111-1111-1111-111111111111',
    description: 'Product UUID to add to this collection',
  })
  @IsUUID('4')
  productId!: string;
}
