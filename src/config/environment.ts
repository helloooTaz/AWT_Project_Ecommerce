import { config as loadDotenv } from 'dotenv';
import Joi from 'joi';

const databaseSchema = Joi.object({
  DB_HOST: Joi.string().default('127.0.0.1'),
  DB_PORT: Joi.number().port().default(5433),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
});

const appSchema = databaseSchema.keys({
  HOST: Joi.string().default('127.0.0.1'),
  PORT: Joi.number().port().default(3000),
  JWT_SECRET: Joi.string().trim().min(32).required(),
  JWT_TTL_SECONDS: Joi.number().integer().min(60).max(86_400).default(3600),
});

export interface DatabaseEnvironment {
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
}

export interface AppEnvironment extends DatabaseEnvironment {
  HOST: string;
  PORT: number;
  JWT_SECRET: string;
  JWT_TTL_SECONDS: number;
}

function validate<T>(schema: Joi.ObjectSchema, values: Record<string, unknown>): T {
  const result = schema.validate(values, { allowUnknown: true, abortEarly: false });
  if (result.error) {
    throw new Error(`Invalid environment. ${result.error.message}`);
  }
  return result.value as T;
}

export function validateAppEnvironment(values: Record<string, unknown>): AppEnvironment {
  return validate<AppEnvironment>(appSchema, values);
}

export function loadDatabaseEnvironment(): DatabaseEnvironment {
  loadDotenv();
  return validate<DatabaseEnvironment>(databaseSchema, process.env);
}
