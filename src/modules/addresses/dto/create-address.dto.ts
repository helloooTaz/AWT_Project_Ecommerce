import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  NotContains,
} from 'class-validator';

function trimText({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAddressDto {
  @ApiProperty({ example: 'Samira Rahman', maxLength: 120 })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @NotContains('\0', { message: 'recipient must not contain a null character' })
  @MaxLength(120)
  recipient!: string;

  @ApiProperty({ example: '+8801712345678' })
  @Transform(trimText)
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: 'phone must contain 7 to 15 digits with an optional leading +',
  })
  phone!: string;

  @ApiProperty({ example: 'House 12, Road 5', maxLength: 255 })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @NotContains('\0', {
    message: 'addressLine1 must not contain a null character',
  })
  @MaxLength(255)
  addressLine1!: string;

  @ApiPropertyOptional({
    example: 'Apartment 3B',
    type: String,
    nullable: true,
    maxLength: 255,
  })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @NotContains('\0', {
    message: 'addressLine2 must not contain a null character',
  })
  @MaxLength(255)
  addressLine2?: string | null;

  @ApiProperty({ example: 'Dhaka', maxLength: 100 })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @NotContains('\0', { message: 'city must not contain a null character' })
  @MaxLength(100)
  city!: string;
}
