import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { validateEnvironment } from '../config/env.validation';
import { databaseOptions } from './database.options';

config({ quiet: true });
const { DATABASE_URL } = validateEnvironment(process.env);

export default new DataSource(databaseOptions(DATABASE_URL));
