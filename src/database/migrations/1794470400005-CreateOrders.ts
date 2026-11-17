import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrders1794470400005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "order_status" AS ENUM (
        'PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED',
        'DELIVERED', 'CANCELLED', 'EXPIRED'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "status" "order_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
        "currency" varchar(3) NOT NULL DEFAULT 'BDT',
        "total_minor" bigint NOT NULL,
        "shipping_address_snapshot" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_orders" PRIMARY KEY ("id"),
        CONSTRAINT "ck_orders_currency" CHECK ("currency" = 'BDT'),
        CONSTRAINT "ck_orders_total" CHECK ("total_minor" >= 0),
        CONSTRAINT "fk_orders_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_orders_owner_created" ON "orders" ("user_id", "created_at", "id")',
    );
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "variant_id" uuid,
        "sku_snapshot" varchar(64) NOT NULL,
        "name_snapshot" varchar(160) NOT NULL,
        "size_snapshot" varchar(32) NOT NULL,
        "color_snapshot" varchar(64) NOT NULL,
        "unit_price_minor" bigint NOT NULL,
        "quantity" integer NOT NULL,
        "line_total_minor" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "ck_order_items_unit_price" CHECK ("unit_price_minor" >= 0),
        CONSTRAINT "ck_order_items_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "ck_order_items_line_total"
          CHECK ("line_total_minor" = "unit_price_minor" * "quantity"),
        CONSTRAINT "fk_order_items_order"
          FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_order_items_variant"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_order_items_order_created" ON "order_items" ("order_id", "created_at", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_order_items_variant" ON "order_items" ("variant_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "order_items"');
    await queryRunner.query('DROP TABLE "orders"');
    await queryRunner.query('DROP TYPE "order_status"');
  }
}
