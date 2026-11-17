import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSizeGuides1794470400009 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "size_guides" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "measurement_unit" varchar(2) NOT NULL DEFAULT 'cm',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_size_guides" PRIMARY KEY ("id"),
        CONSTRAINT "uq_size_guides_product" UNIQUE ("product_id"),
        CONSTRAINT "ck_size_guides_measurement_unit" CHECK ("measurement_unit" = 'cm'),
        CONSTRAINT "fk_size_guides_product"
          FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE
      )
    `);

    const measurements = [
      ['height', 'cm'],
      ['weight', 'kg'],
      ['chest', 'cm'],
      ['waist', 'cm'],
      ['hip', 'cm'],
    ];
    const columns = measurements.flatMap(([name, unit]) => [
      `"min_${name}_${unit}" numeric(6, 2)`,
      `"max_${name}_${unit}" numeric(6, 2)`,
    ]);
    const checks = measurements.map(([name, unit]) => {
      const min = `"min_${name}_${unit}"`;
      const max = `"max_${name}_${unit}"`;
      return `CONSTRAINT "ck_size_guide_ranges_${name}"
        CHECK (${min} BETWEEN 0.01 AND 9999.99 AND ${max} BETWEEN 0.01 AND 9999.99 AND ${min} <= ${max})`;
    });
    await queryRunner.query(`
      CREATE TABLE "size_guide_ranges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "size_guide_id" uuid NOT NULL,
        "size" varchar(32) NOT NULL,
        ${columns.join(',\n        ')},
        CONSTRAINT "pk_size_guide_ranges" PRIMARY KEY ("id"),
        CONSTRAINT "uq_size_guide_ranges_size" UNIQUE ("size_guide_id", "size"),
        CONSTRAINT "ck_size_guide_ranges_size" CHECK ("size" <> '' AND "size" = btrim("size")),
        ${checks.join(',\n        ')},
        CONSTRAINT "ck_size_guide_ranges_measurements" CHECK (
          num_nonnulls("min_height_cm", "max_height_cm", "min_weight_kg", "max_weight_kg",
            "min_chest_cm", "max_chest_cm", "min_waist_cm", "max_waist_cm", "min_hip_cm", "max_hip_cm") > 0
        ),
        CONSTRAINT "fk_size_guide_ranges_guide"
          FOREIGN KEY ("size_guide_id") REFERENCES "size_guides" ("id") ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "size_guide_ranges"');
    await queryRunner.query('DROP TABLE "size_guides"');
  }
}
