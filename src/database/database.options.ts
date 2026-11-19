import { extname, join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

export function databaseOptions(url: string): DataSourceOptions {
  const extension = extname(__filename);
  const useSsl =
    process.env.DB_SSL === 'true' ||
    url.includes('sslmode=require') ||
    url.includes('render.com') ||
    url.includes('neon.tech') ||
    url.includes('supabase.co') ||
    url.includes('aivencloud.com');

  return {
    type: 'postgres',
    url,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    synchronize: false,
    migrationsRun: false,
    entities: [join(__dirname, '..', 'modules', '**', `*.entity${extension}`)],
    migrations: [join(__dirname, 'migrations', `*${extension}`)],
  };
}
