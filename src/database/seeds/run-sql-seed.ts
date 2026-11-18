import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import dataSource from '../data-source';

config({ quiet: true });

async function runSqlSeed() {
  console.log(`[SeedSQL] Connecting to database...`);
  await dataSource.initialize();

  try {
    const schemaPath = join(__dirname, '..', 'schema.sql');
    console.log(`[SeedSQL] Applying schema DDL from ${schemaPath}...`);
    const schemaSql = readFileSync(schemaPath, 'utf-8');
    await dataSource.query(schemaSql);
    console.log(
      `[SeedSQL] Schema tables, constraints, and triggers applied successfully.`,
    );

    const seedPath = join(__dirname, '..', 'seed.sql');
    console.log(`[SeedSQL] Reading SQL seed file from ${seedPath}...`);
    const seedSql = readFileSync(seedPath, 'utf-8');

    console.log(`[SeedSQL] Executing seed SQL statements...`);
    await dataSource.query(seedSql);
    console.log(
      `[SeedSQL] Database successfully reset and seeded with canonical demo fixtures!`,
    );
  } catch (error) {
    console.error(`[SeedSQL] Failed to execute seed SQL:`, error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

runSqlSeed().catch((error) => {
  console.error('[SeedSQL] Unhandled error during seed execution:', error);
  process.exit(1);
});
