import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { validateDatabaseUrl } from '../config/env.validation';
import { databaseOptions } from './database.options';

config({ quiet: true });
export default new DataSource(
  databaseOptions(validateDatabaseUrl(process.env.DATABASE_URL)),
);
