import { ApiProperty, ApiPropertyOptional, OmitType, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsString, Length, NotContains, ValidateIf } from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination';
import { RegisterDto, UserResponseDto } from '../auth/auth.dto';
import { Role } from '../auth/role';

export const managedStaffRoles = [Role.Staff, Role.InventoryManager] as const;
type ManagedStaffRole = typeof managedStaffRoles[number];

export class CreateStaffAccountDto extends PickType(RegisterDto, ['email', 'password']) {
  @ApiProperty({ example: 'Sam Rahman', minLength: 1, maxLength: 100 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  @NotContains('\0', { message: 'name must not contain a null character' })
  name!: string;

  @ApiProperty({ enum: managedStaffRoles, enumName: 'ManagedStaffRole', example: Role.Staff })
  @IsIn(managedStaffRoles)
  role!: ManagedStaffRole;
}

export class UpdateStaffAccountDto extends PartialType(OmitType(CreateStaffAccountDto, ['password']), {
  skipNullProperties: false,
}) {
  @ApiPropertyOptional({ type: Boolean, example: false })
  @ValidateIf((_input, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class StaffAccountQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: managedStaffRoles, enumName: 'ManagedStaffRole', example: Role.InventoryManager })
  @ValidateIf((_input, value) => value !== undefined)
  @IsIn(managedStaffRoles)
  role?: ManagedStaffRole;

  @ApiPropertyOptional({ type: Boolean, example: true })
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @ValidateIf((_input, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class StaffAccountResponseDto extends UserResponseDto {
  @ApiProperty({ enum: managedStaffRoles, enumName: 'ManagedStaffRole' })
  declare role: Role;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
