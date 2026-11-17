import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1794470400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_role" AS ENUM ('CUSTOMER', 'STAFF', 'INVENTORY_MANAGER', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL,
        "password_hash" varchar(60) NOT NULL,
        "full_name" varchar(120) NOT NULL,
        "role" "user_role" NOT NULL DEFAULT 'CUSTOMER',
        "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "users"');
    await queryRunner.query('DROP TYPE "user_status"');
    await queryRunner.query('DROP TYPE "user_role"');
  }
}
