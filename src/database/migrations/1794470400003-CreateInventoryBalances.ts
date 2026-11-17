import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryBalances1794470400003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inventory_balances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "variant_id" uuid NOT NULL,
        "on_hand" integer NOT NULL DEFAULT 0,
        "reserved" integer NOT NULL DEFAULT 0,
        CONSTRAINT "pk_inventory_balances" PRIMARY KEY ("id"),
        CONSTRAINT "uq_inventory_balances_variant" UNIQUE ("variant_id"),
        CONSTRAINT "ck_inventory_balances_on_hand" CHECK ("on_hand" >= 0),
        CONSTRAINT "ck_inventory_balances_reserved" CHECK ("reserved" >= 0 AND "reserved" <= "on_hand"),
        CONSTRAINT "fk_inventory_balances_variant"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants" ("id") ON DELETE RESTRICT
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "inventory_balances"');
  }
}
