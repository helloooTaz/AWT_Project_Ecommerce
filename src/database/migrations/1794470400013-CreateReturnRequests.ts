import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReturnRequests1794470400013 implements MigrationInterface {
  name = 'CreateReturnRequests1794470400013';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "return_status" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED')
    `);

    await queryRunner.query(`
      CREATE TABLE "return_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "reviewed_by" uuid,
        "status" "return_status" NOT NULL DEFAULT 'REQUESTED',
        "reason" varchar(255) NOT NULL,
        "staff_notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_return_requests" PRIMARY KEY ("id"),
        CONSTRAINT "fk_return_requests_order"
          FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_return_requests_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_return_requests_reviewer"
          FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      'CREATE INDEX "idx_return_requests_order" ON "return_requests" ("order_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_return_requests_user" ON "return_requests" ("user_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "return_requests"');
    await queryRunner.query('DROP TYPE "return_status"');
  }
}
