import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

const MAX_POSTGRES_INTEGER = 2147483647;

export class UpdateCartItemDto {
  @ApiProperty({ example: 2, minimum: 1, maximum: MAX_POSTGRES_INTEGER })
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INTEGER)
  quantity!: number;
}
