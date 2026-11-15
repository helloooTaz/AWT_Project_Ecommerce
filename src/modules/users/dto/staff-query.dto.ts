import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UserRole } from '../../roles/user-role.enum';
import { UserStatus } from '../entities/user.entity';

export class StaffQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: [UserRole.STAFF, UserRole.INVENTORY_MANAGER, UserRole.ADMIN],
    description: 'Filter staff by role',
  })
  @IsOptional()
  @IsIn([UserRole.STAFF, UserRole.INVENTORY_MANAGER, UserRole.ADMIN])
  role?: UserRole;

  @ApiPropertyOptional({
    enum: [UserStatus.ACTIVE, UserStatus.INACTIVE],
    description: 'Filter staff by status',
  })
  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.INACTIVE])
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Search by full name or email' })
  @IsOptional()
  @IsString()
  search?: string;
}
