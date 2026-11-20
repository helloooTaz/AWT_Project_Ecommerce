import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Matches, Max, Min, NotContains, ValidateIf } from 'class-validator';

const addressText = /^(?=[\s\S]*\S)[^\0]+$/;
const addressTextValidation = {
  message: '$property must contain non-whitespace text and no null characters',
};

export class UpdateProfileDto {
  @ApiProperty({ example: 'Sam Rahman', minLength: 1, maxLength: 100 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  @NotContains('\0', { message: 'name must not contain a null character' })
  name!: string;
}

export class CreateAddressDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Matches(addressText, addressTextValidation)
  @Length(1, 100)
  recipientName!: string;

  @ApiProperty({ minLength: 1, maxLength: 30 })
  @IsString()
  @Matches(addressText, addressTextValidation)
  @Length(1, 30)
  phone!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @Matches(addressText, addressTextValidation)
  @Length(1, 200)
  line1!: string;

  @ApiPropertyOptional({ nullable: true, type: String, minLength: 1, maxLength: 200 })
  @ValidateIf((_input, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(addressText, addressTextValidation)
  @Length(1, 200)
  line2?: string | null;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Matches(addressText, addressTextValidation)
  @Length(1, 100)
  city!: string;

  @ApiProperty({ minLength: 1, maxLength: 20 })
  @IsString()
  @Matches(addressText, addressTextValidation)
  @Length(1, 20)
  postalCode!: string;

  @ApiProperty({ example: 'BD', pattern: '^[A-Z]{2}$' })
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto, { skipNullProperties: false }) {}

export class AddressResponseDto extends CreateAddressDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, minLength: 1, maxLength: 200 })
  declare line2: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class SetCartItemDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}

export class CheckoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  addressId!: string;
}

