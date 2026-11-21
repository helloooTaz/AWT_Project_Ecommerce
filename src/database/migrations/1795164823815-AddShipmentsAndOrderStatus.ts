import { MigrationInterface, QueryRunner } from "typeorm";

export class AddShipmentsAndOrderStatus1795164823815 implements MigrationInterface {
    name = 'AddShipmentsAndOrderStatus1795164823815'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."shipment_status" AS ENUM('created', 'in_transit', 'delivered', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "shipments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "orderId" uuid NOT NULL, "carrier" character varying(100) NOT NULL, "trackingNumber" character varying(100) NOT NULL, "status" "public"."shipment_status" NOT NULL DEFAULT 'in_transit', "shippedAt" TIMESTAMP WITH TIME ZONE, "deliveredAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "REL_13ba957bcb616719a0dc3fca82" UNIQUE ("orderId"), CONSTRAINT "PK_6deda4532ac542a93eab214b564" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_shipments_order" ON "shipments" ("orderId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_shipments_tracking" ON "shipments" ("trackingNumber") `);
        await queryRunner.query(`CREATE TYPE "public"."order_status" AS ENUM('placed', 'processing', 'shipped', 'delivered', 'cancelled')`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "status" "public"."order_status" NOT NULL DEFAULT 'placed'`);
        await queryRunner.query(`ALTER TABLE "shipments" ADD CONSTRAINT "FK_13ba957bcb616719a0dc3fca82f" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shipments" DROP CONSTRAINT "FK_13ba957bcb616719a0dc3fca82f"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."order_status"`);
        await queryRunner.query(`DROP INDEX "public"."uq_shipments_tracking"`);
        await queryRunner.query(`DROP INDEX "public"."uq_shipments_order"`);
        await queryRunner.query(`DROP TABLE "shipments"`);
        await queryRunner.query(`DROP TYPE "public"."shipment_status"`);
    }

}
