import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsByteLength, IsEmail, IsString, Length, Matches, MaxLength, NotContains } from 'class-validator';
import { Role, type AuthenticatedUser } from './role';

export class LoginDto {
  @ApiProperty({ example: 'customer@example.com', maxLength: 254 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail({ allow_utf8_local_part: false })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 72 })
  @IsString()
  @Length(8, 72)
  @IsByteLength(8, 72, { message: 'password must be at most 72 UTF-8 bytes' })
  @Matches(/^(?=[\s\S]*\S)[\s\S]+$/, { message: 'password must contain a non-whitespace character' })
  password!: string;
}

export class RegisterDto extends LoginDto {
  @ApiProperty({ example: 'Sam Rahman', minLength: 1, maxLength: 100 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  @NotContains('\0', { message: 'name must not contain a null character' })
  name!: string;
}

export class UserResponseDto implements AuthenticatedUser {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: () => UserResponseDto })
  user!: UserResponseDto;
}
