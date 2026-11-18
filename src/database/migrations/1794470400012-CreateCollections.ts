import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCollections1794470400012 implements MigrationInterface {
  name = 'CreateCollections1794470400012';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "collections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL,
        "slug" varchar(120) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_collections" PRIMARY KEY ("id"),
        CONSTRAINT "uq_collections_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_collections" (
        "product_id" uuid NOT NULL,
        "collection_id" uuid NOT NULL,
        CONSTRAINT "pk_product_collections" PRIMARY KEY ("product_id", "collection_id"),
        CONSTRAINT "fk_product_collections_product"
          FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_product_collections_collection"
          FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      'CREATE INDEX "idx_product_collections_collection" ON "product_collections" ("collection_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "product_collections"');
    await queryRunner.query('DROP TABLE "collections"');
  }
}
