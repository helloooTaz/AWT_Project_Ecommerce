import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { UserRole } from '../../roles/user-role.enum';
import { UserStatus } from '../entities/user.entity';

export class UpdateStaffDto {
  @ApiPropertyOptional({
    example: 'Updated Staff Name',
    minLength: 2,
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;

  @ApiPropertyOptional({
    enum: [UserRole.STAFF, UserRole.INVENTORY_MANAGER],
    example: UserRole.INVENTORY_MANAGER,
  })
  @IsOptional()
  @IsIn([UserRole.STAFF, UserRole.INVENTORY_MANAGER], {
    message: 'Staff role must be STAFF or INVENTORY_MANAGER',
  })
  role?: UserRole.STAFF | UserRole.INVENTORY_MANAGER;

  @ApiPropertyOptional({
    enum: [UserStatus.ACTIVE, UserStatus.INACTIVE],
    example: UserStatus.ACTIVE,
  })
  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.INACTIVE], {
    message: 'Status must be ACTIVE or INACTIVE',
  })
  status?: UserStatus;
}
