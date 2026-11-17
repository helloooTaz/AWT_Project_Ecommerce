import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAddresses1794470400001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "addresses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "recipient" varchar(120) NOT NULL,
        "phone" varchar(16) NOT NULL,
        "address_line_1" varchar(255) NOT NULL,
        "address_line_2" varchar(255),
        "city" varchar(100) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_addresses" PRIMARY KEY ("id"),
        CONSTRAINT "fk_addresses_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_addresses_owner_created" ON "addresses" ("user_id", "created_at", "id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "addresses"');
  }
}
