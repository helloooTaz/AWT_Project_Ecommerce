import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCartCatalog1794470400002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL,
        "slug" varchar(120) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_categories" PRIMARY KEY ("id"),
        CONSTRAINT "uq_categories_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "product_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED')
    `);
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "category_id" uuid NOT NULL,
        "name" varchar(160) NOT NULL,
        "slug" varchar(160) NOT NULL,
        "description" text NOT NULL,
        "status" "product_status" NOT NULL DEFAULT 'DRAFT',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_products" PRIMARY KEY ("id"),
        CONSTRAINT "uq_products_slug" UNIQUE ("slug"),
        CONSTRAINT "fk_products_category"
          FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_products_category" ON "products" ("category_id")',
    );
    await queryRunner.query(`
      CREATE TABLE "product_variants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "sku" varchar(64) NOT NULL,
        "size" varchar(32) NOT NULL,
        "color" varchar(64) NOT NULL,
        "price_minor" integer NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_product_variants" PRIMARY KEY ("id"),
        CONSTRAINT "uq_product_variants_sku" UNIQUE ("sku"),
        CONSTRAINT "ck_product_variants_price" CHECK ("price_minor" >= 0),
        CONSTRAINT "fk_product_variants_product"
          FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_product_variants_product" ON "product_variants" ("product_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "product_variants"');
    await queryRunner.query('DROP TABLE "products"');
    await queryRunner.query('DROP TYPE "product_status"');
    await queryRunner.query('DROP TABLE "categories"');
  }
}
