import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ReturnStatus } from '../entities/return-request.entity';

export class ReturnQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ReturnStatus,
    description: 'Filter return requests by status',
  })
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;
}
