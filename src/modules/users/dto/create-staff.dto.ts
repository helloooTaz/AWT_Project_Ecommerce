import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, Length } from 'class-validator';
import { UserRole } from '../../roles/user-role.enum';

export class CreateStaffDto {
  @ApiProperty({ example: 'staff.member@thread.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Operational Staff', minLength: 2, maxLength: 120 })
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @ApiProperty({
    example: 'secureStaffPassword123',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @Length(8, 72)
  password!: string;

  @ApiProperty({
    enum: [UserRole.STAFF, UserRole.INVENTORY_MANAGER],
    example: UserRole.STAFF,
  })
  @IsIn([UserRole.STAFF, UserRole.INVENTORY_MANAGER], {
    message: 'Staff role must be STAFF or INVENTORY_MANAGER',
  })
  role!: UserRole.STAFF | UserRole.INVENTORY_MANAGER;
}
