import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStockReservations1794470400006 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "stock_reservation_status" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED')
    `);
    await queryRunner.query(`
      CREATE TABLE "stock_reservations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_item_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "status" "stock_reservation_status" NOT NULL DEFAULT 'ACTIVE',
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_stock_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_stock_reservations_order_item" UNIQUE ("order_item_id"),
        CONSTRAINT "ck_stock_reservations_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "fk_stock_reservations_order_item"
          FOREIGN KEY ("order_item_id") REFERENCES "order_items" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_stock_reservations_variant"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_stock_reservations_variant" ON "stock_reservations" ("variant_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_stock_reservations_status_expires" ON "stock_reservations" ("status", "expires_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "stock_reservations"');
    await queryRunner.query('DROP TYPE "stock_reservation_status"');
  }
}
