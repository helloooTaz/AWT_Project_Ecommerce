import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStockMovementsAndShipments1794470400010
  implements MigrationInterface
{
  name = 'CreateStockMovementsAndShipments1794470400010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. stock_movements table
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "stock_movements_type_enum" AS ENUM (
          'RECEIPT', 'ADJUSTMENT', 'RESERVATION_CONSUMED', 'RESERVATION_RELEASED', 'RETURN_RESTOCK'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_movements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "variant_id" uuid NOT NULL,
        "actor_id" uuid,
        "type" "stock_movements_type_enum" NOT NULL,
        "quantity" integer NOT NULL,
        "reason" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_stock_movements_variant_id" FOREIGN KEY ("variant_id") REFERENCES "product_variants" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_stock_movements_actor_id" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stock_movements_variant_id"
      ON "stock_movements" ("variant_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stock_movements_actor_id"
      ON "stock_movements" ("actor_id");
    `);

    // 2. shipments table
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "shipments_status_enum" AS ENUM (
          'CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shipments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid UNIQUE NOT NULL,
        "carrier" varchar(100) NOT NULL,
        "tracking_number" varchar(100) UNIQUE NOT NULL,
        "status" "shipments_status_enum" NOT NULL DEFAULT 'CREATED',
        "shipped_at" timestamptz,
        "delivered_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_shipments_order_id" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_shipments_order_id"
      ON "shipments" ("order_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shipments";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "shipments_status_enum";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_movements";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "stock_movements_type_enum";`);
  }
}
