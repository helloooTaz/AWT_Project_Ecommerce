import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, Matches } from 'class-validator';
import { PaymentStatus } from '../entities/payment.entity';

const outcomes = [PaymentStatus.PAID, PaymentStatus.FAILED] as const;

export class MockPaymentEventDto {
  @ApiProperty({ type: 'string', format: 'uuid' })
  @IsUUID('4')
  eventId!: string;

  @ApiProperty({ type: 'string', format: 'uuid' })
  @IsUUID('4')
  providerRef!: string;

  @ApiProperty({
    type: 'string',
    description: 'Exact amount as a decimal string in BDT minor units',
    example: '250000',
  })
  @IsString()
  @Matches(/^(0|[1-9][0-9]{0,18})$/)
  amountMinor!: string;

  @ApiProperty({ enum: [...outcomes] })
  @IsIn(outcomes)
  status!: (typeof outcomes)[number];
}
