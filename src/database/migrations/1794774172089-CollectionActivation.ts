import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CollectionActivation1794774172089 implements MigrationInterface {
  name = 'CollectionActivation1794774172089';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "collections" ADD "isActive" boolean NOT NULL DEFAULT true');
  }

  async down(): Promise<void> {
    throw new Error('Collection activation is a forward-only migration');
  }
}
