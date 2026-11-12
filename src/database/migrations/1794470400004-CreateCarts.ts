import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCarts1794470400004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_carts" PRIMARY KEY ("id"),
        CONSTRAINT "uq_carts_user" UNIQUE ("user_id"),
        CONSTRAINT "fk_carts_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "cart_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        CONSTRAINT "pk_cart_items" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cart_items_cart_variant" UNIQUE ("cart_id", "variant_id"),
        CONSTRAINT "ck_cart_items_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "fk_cart_items_cart"
          FOREIGN KEY ("cart_id") REFERENCES "carts" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cart_items_variant"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_cart_items_variant" ON "cart_items" ("variant_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "cart_items"');
    await queryRunner.query('DROP TABLE "carts"');
  }
}
