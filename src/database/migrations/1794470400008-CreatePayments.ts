import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayments1794470400008 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "payment_status" AS ENUM ('INITIATED', 'PENDING', 'PAID', 'FAILED')
    `);
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "provider" varchar(32) NOT NULL,
        "provider_ref" varchar(128),
        "amount_minor" bigint NOT NULL,
        "status" "payment_status" NOT NULL DEFAULT 'INITIATED',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_payments" PRIMARY KEY ("id"),
        CONSTRAINT "uq_payments_provider_ref" UNIQUE ("provider_ref"),
        CONSTRAINT "ck_payments_amount" CHECK ("amount_minor" >= 0),
        CONSTRAINT "fk_payments_order"
          FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_payments_order" ON "payments" ("order_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_payments_open_or_paid_order" ON "payments" ("order_id")
        WHERE "status" IN ('INITIATED', 'PENDING', 'PAID')
    `);
    await queryRunner.query(`
      CREATE TABLE "mock_payment_events" (
        "event_id" uuid NOT NULL,
        "payload_hash" varchar(64) NOT NULL,
        CONSTRAINT "pk_mock_payment_events" PRIMARY KEY ("event_id")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "mock_payment_events"');
    await queryRunner.query('DROP TABLE "payments"');
    await queryRunner.query('DROP TYPE "payment_status"');
  }
}
