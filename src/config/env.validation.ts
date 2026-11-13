import Joi from 'joi';

export interface Environment {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: number;
  SWAGGER_ENABLED: boolean;
  PAYMENT_PROVIDER: 'DISABLED' | 'MOCK';
  MOCK_PAYMENT_SIGNING_SECRET?: string;
  ORDER_EXPIRY_ENABLED: boolean;
  ORDER_EXPIRY_POLL_INTERVAL_MS: number;
  ORDER_EXPIRY_BATCH_SIZE: number;
  MAIL_ENABLED: boolean;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  MAIL_FROM?: string;
}

const databaseUrlSchema = Joi.string()
  .uri({ scheme: ['postgres', 'postgresql'] })
  .required();

const schema = Joi.object<Environment>({
  DATABASE_URL: databaseUrlSchema,
  JWT_SECRET: Joi.string().trim().min(32).required(),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  SWAGGER_ENABLED: Joi.boolean().default(true),
  PAYMENT_PROVIDER: Joi.string().valid('DISABLED', 'MOCK').default('DISABLED'),
  MOCK_PAYMENT_SIGNING_SECRET: Joi.when('PAYMENT_PROVIDER', {
    is: 'MOCK',
    then: Joi.string().trim().min(32).invalid(Joi.ref('JWT_SECRET')).required(),
    otherwise: Joi.string().allow(''),
  }),
  ORDER_EXPIRY_ENABLED: Joi.when('NODE_ENV', {
    is: Joi.valid('test').required(),
    then: Joi.boolean().default(false),
    otherwise: Joi.boolean().default(true),
  }),
  ORDER_EXPIRY_POLL_INTERVAL_MS: Joi.number()
    .integer()
    .min(1000)
    .max(3_600_000)
    .default(60_000),
  ORDER_EXPIRY_BATCH_SIZE: Joi.number().integer().min(1).max(100).default(25),
  MAIL_ENABLED: Joi.boolean().default(false),
  SMTP_HOST: Joi.when('MAIL_ENABLED', {
    is: true,
    then: Joi.string().trim().hostname().required(),
  }),
  SMTP_PORT: Joi.when('MAIL_ENABLED', {
    is: true,
    then: Joi.number().integer().min(1).max(65535).required(),
  }),
  SMTP_USER: Joi.when('MAIL_ENABLED', {
    is: true,
    then: Joi.string().trim().required(),
  }),
  SMTP_PASSWORD: Joi.when('MAIL_ENABLED', {
    is: true,
    then: Joi.string().pattern(/\S/).required(),
  }),
  MAIL_FROM: Joi.when('MAIL_ENABLED', {
    is: true,
    then: Joi.string()
      .trim()
      .email({ tlds: { allow: false } })
      .required(),
  }),
});

export function validateDatabaseUrl(value: unknown): string {
  const result = databaseUrlSchema.validate(value);
  if (result.error) {
    throw new Error('Invalid environment configuration: DATABASE_URL');
  }
  return result.value;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Environment {
  const result = schema.validate(environment, {
    abortEarly: false,
    allowUnknown: true,
  });

  if (result.error) {
    const keys = result.error.details.map(({ path }) => path.join('.'));
    throw new Error(`Invalid environment configuration: ${keys.join(', ')}`);
  }

  return result.value;
}
