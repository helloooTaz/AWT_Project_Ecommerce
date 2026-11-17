import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdempotencyRecords1794470400007 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "idempotency_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "request_key" varchar(128) NOT NULL,
        "request_hash" varchar(64) NOT NULL,
        "order_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_idempotency_records" PRIMARY KEY ("id"),
        CONSTRAINT "uq_idempotency_records_user_key" UNIQUE ("user_id", "request_key"),
        CONSTRAINT "fk_idempotency_records_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_idempotency_records_order"
          FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_idempotency_records_order" ON "idempotency_records" ("order_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "idempotency_records"');
  }
}
