import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1794687772089 implements MigrationInterface {
    name = 'InitialSchema1794687772089'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."user_role" AS ENUM('customer', 'staff', 'inventory_manager', 'admin')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(254) NOT NULL, "name" character varying(100) NOT NULL, "passwordHash" character varying(60) NOT NULL, "role" "public"."user_role" NOT NULL DEFAULT 'customer', "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "ck_users_email_normalized" CHECK ("email" = lower(btrim("email"))), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "addresses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "recipientName" character varying(100) NOT NULL, "phone" character varying(30) NOT NULL, "line1" character varying(200) NOT NULL, "line2" character varying(200), "city" character varying(100) NOT NULL, "postalCode" character varying(20) NOT NULL, "countryCode" character varying(2) NOT NULL, CONSTRAINT "PK_745d8f43d3af10ab8247465e450" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_addresses_user" ON "addresses" ("userId") `);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "slug" character varying(120) NOT NULL, "description" text, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_categories_slug" ON "categories" ("slug") `);
        await queryRunner.query(`CREATE TABLE "collections" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "slug" character varying(120) NOT NULL, "description" text, CONSTRAINT "PK_21c00b1ebbd41ba1354242c5c4e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_collections_slug" ON "collections" ("slug") `);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "slug" character varying(120) NOT NULL, "description" text, "categoryId" uuid NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_products_category" ON "products" ("categoryId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_products_slug" ON "products" ("slug") `);
        await queryRunner.query(`CREATE TABLE "product_variants" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "productId" uuid NOT NULL, "sku" character varying(64) NOT NULL, "size" character varying(32) NOT NULL, "color" character varying(48) NOT NULL, "priceMinor" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "ck_variants_price" CHECK ("priceMinor" >= 0), CONSTRAINT "PK_281e3f2c55652d6a22c0aa59fd7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_variants_options" ON "product_variants" ("productId", "size", "color") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_variants_sku" ON "product_variants" ("sku") `);
        await queryRunner.query(`CREATE TABLE "carts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, CONSTRAINT "REL_69828a178f152f157dcf2f70a8" UNIQUE ("userId"), CONSTRAINT "PK_b5f695a59f5ebb50af3c8160816" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "cart_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cartId" uuid NOT NULL, "variantId" uuid NOT NULL, "quantity" integer NOT NULL, CONSTRAINT "ck_cart_items_quantity" CHECK ("quantity" > 0), CONSTRAINT "PK_6fccf5ec03c172d27a28a82928b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_cart_items_variant" ON "cart_items" ("variantId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_cart_variant" ON "cart_items" ("cartId", "variantId") `);
        await queryRunner.query(`CREATE TABLE "inventory_stock" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "variantId" uuid NOT NULL, "quantity" integer NOT NULL DEFAULT '0', CONSTRAINT "REL_7daff23230423fa09bb00a640f" UNIQUE ("variantId"), CONSTRAINT "ck_stock_nonnegative" CHECK ("quantity" >= 0), CONSTRAINT "PK_a13d56d2087e6d9eb3d480395bf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."inventory_movement_type" AS ENUM('receipt', 'adjustment', 'sale')`);
        await queryRunner.query(`CREATE TABLE "inventory_movements" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "variantId" uuid NOT NULL, "actorId" uuid NOT NULL, "type" "public"."inventory_movement_type" NOT NULL, "delta" integer NOT NULL, "reason" character varying(240) NOT NULL, CONSTRAINT "ck_movement_delta" CHECK (("type" = 'receipt' AND "delta" > 0)
    OR ("type" = 'adjustment' AND "delta" <> 0)
    OR ("type" = 'sale' AND "delta" < 0)), CONSTRAINT "PK_d7597827c1dcffae889db3ab873" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_movements_variant_time" ON "inventory_movements" ("variantId", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "shippingAddress" jsonb NOT NULL, "totalMinor" integer NOT NULL, CONSTRAINT "ck_orders_total" CHECK ("totalMinor" >= 0), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_orders_user_time" ON "orders" ("userId", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "orderId" uuid NOT NULL, "variantId" uuid NOT NULL, "sku" character varying(64) NOT NULL, "productName" character varying(120) NOT NULL, "size" character varying(32) NOT NULL, "color" character varying(48) NOT NULL, "unitPriceMinor" integer NOT NULL, "quantity" integer NOT NULL, CONSTRAINT "ck_order_items_values" CHECK ("quantity" > 0 AND "unitPriceMinor" >= 0), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_order_items_variant" ON "order_items" ("variantId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_order_variant" ON "order_items" ("orderId", "variantId") `);
        await queryRunner.query(`CREATE TABLE "product_collections" ("productId" uuid NOT NULL, "collectionId" uuid NOT NULL, CONSTRAINT "PK_f0480fb4be021b4c18de6270e76" PRIMARY KEY ("productId", "collectionId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f8e9b2201736fa49753b3f103d" ON "product_collections" ("productId") `);
        await queryRunner.query(`CREATE INDEX "IDX_770acab80a3957898eba6248f1" ON "product_collections" ("collectionId") `);
        await queryRunner.query(`ALTER TABLE "addresses" ADD CONSTRAINT "FK_95c93a584de49f0b0e13f753630" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_ff56834e735fa78a15d0cf21926" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_variants" ADD CONSTRAINT "FK_f515690c571a03400a9876600b5" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "FK_69828a178f152f157dcf2f70a89" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "FK_edd714311619a5ad09525045838" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "FK_5a27845bc2d79be6f1fa3d2c036" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_stock" ADD CONSTRAINT "FK_7daff23230423fa09bb00a640ff" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_d76f5767ea35d4c281d2bcac34f" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_4582ccf8b9a37884ce08d5dd021" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_516736b9807228bb17b2d0a3e2a" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_collections" ADD CONSTRAINT "FK_f8e9b2201736fa49753b3f103d2" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "product_collections" ADD CONSTRAINT "FK_770acab80a3957898eba6248f1b" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_collections" DROP CONSTRAINT "FK_770acab80a3957898eba6248f1b"`);
        await queryRunner.query(`ALTER TABLE "product_collections" DROP CONSTRAINT "FK_f8e9b2201736fa49753b3f103d2"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_516736b9807228bb17b2d0a3e2a"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_4582ccf8b9a37884ce08d5dd021"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_d76f5767ea35d4c281d2bcac34f"`);
        await queryRunner.query(`ALTER TABLE "inventory_stock" DROP CONSTRAINT "FK_7daff23230423fa09bb00a640ff"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_5a27845bc2d79be6f1fa3d2c036"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_edd714311619a5ad09525045838"`);
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_69828a178f152f157dcf2f70a89"`);
        await queryRunner.query(`ALTER TABLE "product_variants" DROP CONSTRAINT "FK_f515690c571a03400a9876600b5"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_ff56834e735fa78a15d0cf21926"`);
        await queryRunner.query(`ALTER TABLE "addresses" DROP CONSTRAINT "FK_95c93a584de49f0b0e13f753630"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_770acab80a3957898eba6248f1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f8e9b2201736fa49753b3f103d"`);
        await queryRunner.query(`DROP TABLE "product_collections"`);
        await queryRunner.query(`DROP INDEX "public"."uq_order_variant"`);
        await queryRunner.query(`DROP INDEX "public"."ix_order_items_variant"`);
        await queryRunner.query(`DROP TABLE "order_items"`);
        await queryRunner.query(`DROP INDEX "public"."ix_orders_user_time"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`DROP INDEX "public"."ix_movements_variant_time"`);
        await queryRunner.query(`DROP TABLE "inventory_movements"`);
        await queryRunner.query(`DROP TYPE "public"."inventory_movement_type"`);
        await queryRunner.query(`DROP TABLE "inventory_stock"`);
        await queryRunner.query(`DROP INDEX "public"."uq_cart_variant"`);
        await queryRunner.query(`DROP INDEX "public"."ix_cart_items_variant"`);
        await queryRunner.query(`DROP TABLE "cart_items"`);
        await queryRunner.query(`DROP TABLE "carts"`);
        await queryRunner.query(`DROP INDEX "public"."uq_variants_sku"`);
        await queryRunner.query(`DROP INDEX "public"."uq_variants_options"`);
        await queryRunner.query(`DROP TABLE "product_variants"`);
        await queryRunner.query(`DROP INDEX "public"."uq_products_slug"`);
        await queryRunner.query(`DROP INDEX "public"."ix_products_category"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP INDEX "public"."uq_collections_slug"`);
        await queryRunner.query(`DROP TABLE "collections"`);
        await queryRunner.query(`DROP INDEX "public"."uq_categories_slug"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP INDEX "public"."ix_addresses_user"`);
        await queryRunner.query(`DROP TABLE "addresses"`);
        await queryRunner.query(`DROP INDEX "public"."uq_users_email"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."user_role"`);
    }

}
