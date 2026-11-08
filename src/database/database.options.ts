import { extname, join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

export function databaseOptions(url: string): DataSourceOptions {
  const extension = extname(__filename);

  return {
    type: 'postgres',
    url,
    synchronize: false,
    migrationsRun: false,
    entities: [join(__dirname, '..', 'modules', '**', `*.entity${extension}`)],
    migrations: [join(__dirname, 'migrations', `*${extension}`)],
  };
}
