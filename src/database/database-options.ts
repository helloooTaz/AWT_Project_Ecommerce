import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { DatabaseEnvironment } from '../config/environment';
import { entities } from './entities';

export function databaseOptions(env: DatabaseEnvironment): DataSourceOptions {
  const migrationExtension = __filename.endsWith('.ts') ? 'ts' : 'js';

  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    entities,
    migrations: [join(__dirname, 'migrations', `*.${migrationExtension}`)],
    migrationsTableName: 'thread_migrations',
    synchronize: false,
    migrationsRun: false,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    invalidWhereValuesBehavior: { null: 'throw', undefined: 'throw' },
  };
}
