import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1794470400010 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "actor_id" uuid NULL,
        "action" varchar(60) NOT NULL,
        "entity" varchar(60) NOT NULL,
        "entity_id" varchar(64) NOT NULL,
        "before" jsonb NULL,
        "after" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "fk_audit_logs_actor" FOREIGN KEY ("actor_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_logs_actor" ON "audit_logs"("actor_id");
      CREATE INDEX "idx_audit_logs_action" ON "audit_logs"("action");
      CREATE INDEX "idx_audit_logs_entity" ON "audit_logs"("entity", "entity_id");
      CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at" DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "audit_logs"');
  }
}
