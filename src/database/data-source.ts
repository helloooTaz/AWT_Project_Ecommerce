import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadDatabaseEnvironment } from '../config/environment';
import { databaseOptions } from './database-options';

export default new DataSource(databaseOptions(loadDatabaseEnvironment()));
