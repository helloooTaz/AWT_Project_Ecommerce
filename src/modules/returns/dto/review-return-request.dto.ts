import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ReturnStatus } from '../entities/return-request.entity';

export class ReviewReturnRequestDto {
  @ApiProperty({
    enum: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
    example: ReturnStatus.APPROVED,
    description: 'Decision on the return request',
  })
  @IsEnum(ReturnStatus)
  status!: ReturnStatus.APPROVED | ReturnStatus.REJECTED;

  @ApiPropertyOptional({
    example:
      'Return approved. Customer requested to dispatch back to central warehouse.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 1000)
  staffNotes?: string;
}
