import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, NotContains } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Samira Rahman', minLength: 1, maxLength: 120 })
  @IsString()
  @Matches(/\S/, {
    message: 'fullName must contain a non-whitespace character',
  })
  @NotContains('\0', { message: 'fullName must not contain a null character' })
  @MaxLength(120)
  fullName!: string;
}
