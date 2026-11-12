import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('mock_payment_events')
export class MockPaymentEvent {
  @PrimaryColumn({
    name: 'event_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_mock_payment_events',
  })
  eventId!: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash!: string;
}
